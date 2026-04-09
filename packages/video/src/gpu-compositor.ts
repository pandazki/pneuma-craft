import type { Compositor, CompositeLayer } from './types.js';

const VERTEX_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) texCoord: vec2f,
};

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Full-screen quad: 6 vertices, 2 triangles
  var positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
  );

  var texCoords = array<vec2f, 6>(
    vec2f(0.0, 1.0),
    vec2f(1.0, 1.0),
    vec2f(0.0, 0.0),
    vec2f(0.0, 0.0),
    vec2f(1.0, 1.0),
    vec2f(1.0, 0.0),
  );

  var output: VertexOutput;
  output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  output.texCoord = texCoords[vertexIndex];
  return output;
}
`;

const FRAGMENT_SHADER = /* wgsl */ `
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var texSource: texture_2d<f32>;
@group(0) @binding(2) var<uniform> opacity: f32;

@fragment
fn main(@location(0) texCoord: vec2f) -> @location(0) vec4f {
  var color = textureSample(texSource, texSampler, texCoord);
  // Multiply alpha by uniform opacity
  color.a = color.a * opacity;
  // Premultiply RGB by the new alpha
  color = vec4f(color.rgb * color.a, color.a);
  return color;
}
`;

export async function createGPUCompositor(width: number, height: number): Promise<Compositor> {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('Failed to get WebGPU adapter');
  }

  const device = await adapter.requestDevice();

  // Create sampler
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // Create uniform buffer for opacity (f32 = 4 bytes, aligned to 16)
  const opacityBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Create bind group layout
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  // Create shader modules
  const vertexModule = device.createShaderModule({ code: VERTEX_SHADER });
  const fragmentModule = device.createShaderModule({ code: FRAGMENT_SHADER });

  // Create render pipeline with premultiplied alpha blending
  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: vertexModule,
      entryPoint: 'main',
    },
    fragment: {
      module: fragmentModule,
      entryPoint: 'main',
      targets: [{
        format: 'rgba8unorm',
        blend: {
          color: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        },
      }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  // Create output texture
  let currentWidth = width;
  let currentHeight = height;
  let outputTexture = createOutputTexture(device, width, height);

  function createOutputTexture(dev: GPUDevice, w: number, h: number): GPUTexture {
    return dev.createTexture({
      size: { width: w, height: h },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  return {
    async composite(layers: CompositeLayer[]): Promise<ImageBitmap> {
      const sorted = [...layers]
        .filter((l) => l.opacity > 0)
        .sort((a, b) => a.zIndex - b.zIndex);

      const encoder = device.createCommandEncoder();
      const outputView = outputTexture.createView();

      if (sorted.length === 0) {
        // Clear pass only
        const pass = encoder.beginRenderPass({
          colorAttachments: [{
            view: outputView,
            loadOp: 'clear' as GPULoadOp,
            storeOp: 'store' as GPUStoreOp,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          }],
        });
        pass.end();
      } else {
        for (let i = 0; i < sorted.length; i++) {
          const layer = sorted[i];

          // Create texture from source
          const layerTexture = device.createTexture({
            size: { width: currentWidth, height: currentHeight },
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
          });

          device.queue.copyExternalImageToTexture(
            { source: layer.source as ImageBitmap },
            { texture: layerTexture },
            { width: currentWidth, height: currentHeight },
          );

          // Write opacity uniform
          const opacityData = new Float32Array([layer.opacity]);
          device.queue.writeBuffer(opacityBuffer, 0, opacityData);

          // Create bind group for this layer
          const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
              { binding: 0, resource: sampler },
              { binding: 1, resource: layerTexture.createView() },
              { binding: 2, resource: { buffer: opacityBuffer } },
            ],
          });

          // Render pass: first pass clears, subsequent passes load
          const loadOp: GPULoadOp = i === 0 ? 'clear' : 'load';
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              view: outputView,
              loadOp,
              storeOp: 'store' as GPUStoreOp,
              ...(loadOp === 'clear' ? { clearValue: { r: 0, g: 0, b: 0, a: 0 } } : {}),
            }],
          });

          pass.setPipeline(pipeline);
          pass.setBindGroup(0, bindGroup);
          pass.draw(6);
          pass.end();

          // Destroy per-layer texture after encoding
          layerTexture.destroy();
        }
      }

      // Copy output texture to staging buffer for CPU readback
      const bytesPerRow = Math.ceil(currentWidth * 4 / 256) * 256;
      const bufferSize = bytesPerRow * currentHeight;
      const stagingBuffer = device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

      encoder.copyTextureToBuffer(
        { texture: outputTexture },
        { buffer: stagingBuffer, bytesPerRow },
        { width: currentWidth, height: currentHeight },
      );

      device.queue.submit([encoder.finish()]);

      // Read back pixels from staging buffer
      await stagingBuffer.mapAsync(GPUMapMode.READ);
      const rawData = stagingBuffer.getMappedRange();

      // Copy pixel data row by row (bytesPerRow may have padding)
      const pixelData = new Uint8ClampedArray(currentWidth * currentHeight * 4);
      const src = new Uint8Array(rawData);
      for (let row = 0; row < currentHeight; row++) {
        const srcOffset = row * bytesPerRow;
        const dstOffset = row * currentWidth * 4;
        pixelData.set(src.subarray(srcOffset, srcOffset + currentWidth * 4), dstOffset);
      }

      stagingBuffer.unmap();
      stagingBuffer.destroy();

      // Put pixels into an OffscreenCanvas and create ImageBitmap
      const readbackCanvas = new OffscreenCanvas(currentWidth, currentHeight);
      const ctx = readbackCanvas.getContext('2d')!;
      const imageData = new ImageData(pixelData, currentWidth, currentHeight);
      ctx.putImageData(imageData, 0, 0);
      return createImageBitmap(readbackCanvas);
    },

    resize(w: number, h: number): void {
      outputTexture.destroy();
      currentWidth = w;
      currentHeight = h;
      outputTexture = createOutputTexture(device, w, h);
    },

    destroy(): void {
      outputTexture.destroy();
      opacityBuffer.destroy();
      device.destroy();
    },
  };
}
