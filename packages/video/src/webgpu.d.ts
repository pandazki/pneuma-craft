// WebGPU type stubs for compilation
// Full WebGPU types are available at runtime in supporting browsers

/* eslint-disable @typescript-eslint/no-empty-object-type */

interface GPU {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
}

interface GPURequestAdapterOptions {
  powerPreference?: 'low-power' | 'high-performance';
}

interface GPUAdapter {
  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
}

interface GPUDeviceDescriptor {}

interface GPUDevice {
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
  createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout;
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createSampler(descriptor?: GPUSamplerDescriptor): GPUSampler;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder;
  queue: GPUQueue;
  destroy(): void;
}

interface GPUQueue {
  submit(commandBuffers: GPUCommandBuffer[]): void;
  writeBuffer(buffer: GPUBuffer, offset: number, data: BufferSource): void;
  copyExternalImageToTexture(
    source: GPUImageCopyExternalImage,
    destination: GPUImageCopyTextureTagged,
    copySize: GPUExtent3DDict,
  ): void;
}

interface GPUShaderModule {}
interface GPUShaderModuleDescriptor { code: string }
interface GPURenderPipeline {}
interface GPURenderPipelineDescriptor {
  layout: GPUPipelineLayout;
  vertex: GPUVertexState;
  fragment?: GPUFragmentState;
  primitive?: GPUPrimitiveState;
}
interface GPUVertexState { module: GPUShaderModule; entryPoint: string }
interface GPUFragmentState {
  module: GPUShaderModule;
  entryPoint: string;
  targets: (GPUColorTargetState | null)[];
}
interface GPUColorTargetState {
  format: GPUTextureFormat;
  blend?: GPUBlendState;
}
interface GPUBlendState { color: GPUBlendComponent; alpha: GPUBlendComponent }
interface GPUBlendComponent {
  srcFactor?: GPUBlendFactor;
  dstFactor?: GPUBlendFactor;
  operation?: GPUBlendOperation;
}
type GPUBlendFactor = 'zero' | 'one' | 'src-alpha' | 'one-minus-src-alpha' | 'dst-alpha' | 'one-minus-dst-alpha';
type GPUBlendOperation = 'add' | 'subtract' | 'reverse-subtract' | 'min' | 'max';
interface GPUPrimitiveState { topology?: GPUPrimitiveTopology }
type GPUPrimitiveTopology = 'point-list' | 'line-list' | 'line-strip' | 'triangle-list' | 'triangle-strip';
interface GPUBindGroupLayout {}
interface GPUBindGroupLayoutDescriptor { entries: GPUBindGroupLayoutEntry[] }
interface GPUBindGroupLayoutEntry {
  binding: number;
  visibility: number;
  buffer?: GPUBufferBindingLayout;
  sampler?: GPUSamplerBindingLayout;
  texture?: GPUTextureBindingLayout;
}
interface GPUBufferBindingLayout { type?: 'uniform' | 'storage' | 'read-only-storage' }
interface GPUSamplerBindingLayout { type?: 'filtering' | 'non-filtering' | 'comparison' }
interface GPUTextureBindingLayout { sampleType?: 'float' | 'unfilterable-float' | 'depth' | 'sint' | 'uint' }
interface GPUPipelineLayout {}
interface GPUPipelineLayoutDescriptor { bindGroupLayouts: GPUBindGroupLayout[] }
interface GPUBindGroup {}
interface GPUBindGroupDescriptor {
  layout: GPUBindGroupLayout;
  entries: GPUBindGroupEntry[];
}
interface GPUBindGroupEntry {
  binding: number;
  resource: GPUSampler | GPUTextureView | GPUBufferBinding;
}
interface GPUBufferBinding { buffer: GPUBuffer; offset?: number; size?: number }

interface GPUBuffer {
  mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
  destroy(): void;
  size: number;
}

interface GPUBufferDescriptor { size: number; usage: number; mappedAtCreation?: boolean }

interface GPUSampler {}
interface GPUSamplerDescriptor { magFilter?: GPUFilterMode; minFilter?: GPUFilterMode }
type GPUFilterMode = 'nearest' | 'linear';

interface GPUTexture {
  createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
  width: number;
  height: number;
  destroy(): void;
}
interface GPUTextureDescriptor {
  size: GPUExtent3DDict;
  format: GPUTextureFormat;
  usage: number;
}
type GPUTextureFormat = 'rgba8unorm' | 'bgra8unorm' | 'rgba16float' | 'rgba32float';
interface GPUTextureView {}
interface GPUTextureViewDescriptor {}

interface GPUCommandEncoder {
  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
  copyTextureToBuffer(source: GPUImageCopyTexture, destination: GPUImageCopyBuffer, copySize: GPUExtent3DDict): void;
  finish(): GPUCommandBuffer;
}
interface GPUCommandEncoderDescriptor {}
interface GPUCommandBuffer {}

interface GPURenderPassEncoder {
  setPipeline(pipeline: GPURenderPipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  draw(vertexCount: number, instanceCount?: number): void;
  end(): void;
}
interface GPURenderPassDescriptor { colorAttachments: (GPURenderPassColorAttachment | null)[] }
interface GPURenderPassColorAttachment {
  view: GPUTextureView;
  clearValue?: { r: number; g: number; b: number; a: number };
  loadOp: 'load' | 'clear';
  storeOp: 'store' | 'discard';
}

interface GPUImageCopyTexture { texture: GPUTexture; mipLevel?: number; origin?: GPUOrigin3DDict }
interface GPUImageCopyBuffer { buffer: GPUBuffer; offset?: number; bytesPerRow: number; rowsPerImage?: number }
interface GPUImageCopyTextureTagged { texture: GPUTexture }
interface GPUImageCopyExternalImage { source: ImageBitmap | HTMLCanvasElement | OffscreenCanvas }
interface GPUExtent3DDict { width: number; height?: number; depthOrArrayLayers?: number }
interface GPUOrigin3DDict { x?: number; y?: number; z?: number }

// Constants
declare const GPUBufferUsage: {
  MAP_READ: number;
  MAP_WRITE: number;
  COPY_SRC: number;
  COPY_DST: number;
  INDEX: number;
  VERTEX: number;
  UNIFORM: number;
  STORAGE: number;
  INDIRECT: number;
  QUERY_RESOLVE: number;
};

declare const GPUTextureUsage: {
  COPY_SRC: number;
  COPY_DST: number;
  TEXTURE_BINDING: number;
  STORAGE_BINDING: number;
  RENDER_ATTACHMENT: number;
};

declare const GPUShaderStage: {
  VERTEX: number;
  FRAGMENT: number;
  COMPUTE: number;
};

declare const GPUMapMode: {
  READ: number;
  WRITE: number;
};

interface Navigator {
  gpu?: GPU;
}
