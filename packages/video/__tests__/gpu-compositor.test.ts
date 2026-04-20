import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CompositeLayer } from '../src/types.js';
import { createMockCanvasImageSource, createMockImageBitmap } from './helpers.js';

// ── WebGPU Enum Stubs ─────────────────────────────────────────────────

vi.stubGlobal('GPUBufferUsage', {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  QUERY_RESOLVE: 0x0200,
});

vi.stubGlobal('GPUTextureUsage', {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  STORAGE_BINDING: 0x08,
  RENDER_ATTACHMENT: 0x10,
});

vi.stubGlobal('GPUShaderStage', {
  VERTEX: 0x1,
  FRAGMENT: 0x2,
  COMPUTE: 0x4,
});

vi.stubGlobal('GPUMapMode', {
  READ: 0x0001,
  WRITE: 0x0002,
});

// ── WebGPU Mock Infrastructure ────────────────────────────────────────

function createMockGPUTexture() {
  return {
    createView: vi.fn().mockReturnValue({ label: 'texture-view' }),
    destroy: vi.fn(),
    width: 1920,
    height: 1080,
    format: 'rgba8unorm',
  };
}

function createMockGPURenderPassEncoder() {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
    end: vi.fn(),
  };
}

function createMockGPUCommandEncoder() {
  const renderPassEncoder = createMockGPURenderPassEncoder();
  return {
    encoder: {
      beginRenderPass: vi.fn().mockReturnValue(renderPassEncoder),
      copyTextureToTexture: vi.fn(),
      copyTextureToBuffer: vi.fn(),
      finish: vi.fn().mockReturnValue({ label: 'command-buffer' }),
    },
    renderPassEncoder,
  };
}

function createMockGPUDevice() {
  const { encoder, renderPassEncoder } = createMockGPUCommandEncoder();
  const mockTexture = createMockGPUTexture();

  const device = {
    createShaderModule: vi.fn().mockReturnValue({ label: 'shader-module' }),
    createRenderPipeline: vi.fn().mockReturnValue({ label: 'render-pipeline' }),
    createBindGroupLayout: vi.fn().mockReturnValue({ label: 'bind-group-layout' }),
    createPipelineLayout: vi.fn().mockReturnValue({ label: 'pipeline-layout' }),
    createBindGroup: vi.fn().mockReturnValue({ label: 'bind-group' }),
    createSampler: vi.fn().mockReturnValue({ label: 'sampler' }),
    createBuffer: vi.fn().mockImplementation((descriptor: { size: number }) => ({
      destroy: vi.fn(),
      mapAsync: vi.fn().mockResolvedValue(undefined),
      getMappedRange: vi.fn().mockReturnValue(new ArrayBuffer(descriptor.size)),
      unmap: vi.fn(),
    })),
    createTexture: vi.fn().mockReturnValue(mockTexture),
    createCommandEncoder: vi.fn().mockReturnValue(encoder),
    queue: {
      writeBuffer: vi.fn(),
      copyExternalImageToTexture: vi.fn(),
      submit: vi.fn(),
    },
    destroy: vi.fn(),
    _encoder: encoder,
    _renderPassEncoder: renderPassEncoder,
    _mockTexture: mockTexture,
  };

  return device;
}

function createMockGPUAdapter(device: ReturnType<typeof createMockGPUDevice>) {
  return {
    requestDevice: vi.fn().mockResolvedValue(device),
  };
}

// ── Test Suite ─────────────────────────────────────────────────────────

describe('GPUCompositor', () => {
  let mockDevice: ReturnType<typeof createMockGPUDevice>;
  let mockAdapter: ReturnType<typeof createMockGPUAdapter>;
  let originalNavigator: typeof globalThis.navigator;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDevice = createMockGPUDevice();
    mockAdapter = createMockGPUAdapter(mockDevice);

    originalNavigator = globalThis.navigator;

    // Stub navigator.gpu
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        ...globalThis.navigator,
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
        },
      },
      writable: true,
      configurable: true,
    });

    // Stub OffscreenCanvas for readback
    vi.stubGlobal('OffscreenCanvas', vi.fn().mockImplementation((w: number, h: number) => {
      const ctx = {
        drawImage: vi.fn(),
        clearRect: vi.fn(),
        putImageData: vi.fn(),
        globalAlpha: 1,
      };
      return {
        width: w,
        height: h,
        getContext: vi.fn().mockReturnValue(ctx),
      };
    }));

    vi.stubGlobal('ImageData', vi.fn().mockImplementation((data: Uint8ClampedArray, w: number, h: number) => ({
      data,
      width: w,
      height: h,
    })));

    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(createMockImageBitmap()));
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('creates GPU compositor when WebGPU is available', async () => {
    const { createGPUCompositor } = await import('../src/gpu-compositor.js');
    const compositor = await createGPUCompositor(1920, 1080);

    expect(compositor).toBeDefined();
    expect(compositor.composite).toBeTypeOf('function');
    expect(compositor.resize).toBeTypeOf('function');
    expect(compositor.destroy).toBeTypeOf('function');
  });

  it('initializes WebGPU device and pipeline', async () => {
    const { createGPUCompositor } = await import('../src/gpu-compositor.js');
    await createGPUCompositor(1920, 1080);

    expect(navigator.gpu.requestAdapter).toHaveBeenCalled();
    expect(mockAdapter.requestDevice).toHaveBeenCalled();
    expect(mockDevice.createShaderModule).toHaveBeenCalled();
    expect(mockDevice.createRenderPipeline).toHaveBeenCalled();
    expect(mockDevice.createTexture).toHaveBeenCalled();
  });

  it('composites empty layer list', async () => {
    const { createGPUCompositor } = await import('../src/gpu-compositor.js');
    const compositor = await createGPUCompositor(1920, 1080);

    const result = await compositor.composite([]);
    expect(result).toBeDefined();
    expect(result.width).toBe(1920);
    // Should still produce an output (clear frame)
    expect(mockDevice.createCommandEncoder).toHaveBeenCalled();
  });

  it('composites layers using GPU pipeline', async () => {
    const { createGPUCompositor } = await import('../src/gpu-compositor.js');
    const compositor = await createGPUCompositor(1920, 1080);

    const source = createMockCanvasImageSource();
    const layers: CompositeLayer[] = [
      { source, opacity: 1, zIndex: 0 },
    ];

    await compositor.composite(layers);

    // Should have written opacity to uniform buffer
    expect(mockDevice.queue.writeBuffer).toHaveBeenCalled();
    // Should have copied external image to texture
    expect(mockDevice.queue.copyExternalImageToTexture).toHaveBeenCalled();
    // Should have submitted commands
    expect(mockDevice.queue.submit).toHaveBeenCalled();
    // Should have created a render pass
    expect(mockDevice._encoder.beginRenderPass).toHaveBeenCalled();
    expect(mockDevice._renderPassEncoder.setPipeline).toHaveBeenCalled();
    expect(mockDevice._renderPassEncoder.draw).toHaveBeenCalled();
    expect(mockDevice._renderPassEncoder.end).toHaveBeenCalled();
  });

  it('skips layers with zero opacity', async () => {
    const { createGPUCompositor } = await import('../src/gpu-compositor.js');
    const compositor = await createGPUCompositor(1920, 1080);

    const source = createMockCanvasImageSource();
    const layers: CompositeLayer[] = [
      { source, opacity: 0, zIndex: 0 },
    ];

    // Reset mocks to track only composite() calls
    mockDevice.queue.copyExternalImageToTexture.mockClear();

    await compositor.composite(layers);

    // Should NOT have created textures for zero-opacity layers
    expect(mockDevice.queue.copyExternalImageToTexture).not.toHaveBeenCalled();
  });

  it('sorts layers by zIndex before compositing', async () => {
    const { createGPUCompositor } = await import('../src/gpu-compositor.js');
    const compositor = await createGPUCompositor(1920, 1080);

    const sourceA = createMockCanvasImageSource(100, 100);
    const sourceB = createMockCanvasImageSource(200, 200);
    const layers: CompositeLayer[] = [
      { source: sourceB, opacity: 1, zIndex: 2 },
      { source: sourceA, opacity: 1, zIndex: 1 },
    ];

    await compositor.composite(layers);

    // copyExternalImageToTexture should be called for sourceA first (lower zIndex)
    const calls = mockDevice.queue.copyExternalImageToTexture.mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[0][0].source).toBe(sourceA);
    expect(calls[1][0].source).toBe(sourceB);
  });

  it('destroys layer textures only after command submission', async () => {
    // Make createTexture return unique mocks so we can track per-layer destroys
    const layerTextures: Array<ReturnType<typeof createMockGPUTexture>> = [];
    let textureCallIndex = 0;
    mockDevice.createTexture.mockImplementation(() => {
      textureCallIndex++;
      // First call is the output texture (during init), subsequent are layer textures
      if (textureCallIndex === 1) return mockDevice._mockTexture;
      const tex = createMockGPUTexture();
      layerTextures.push(tex);
      return tex;
    });

    const { createGPUCompositor } = await import('../src/gpu-compositor.js');
    const compositor = await createGPUCompositor(1920, 1080);

    const sourceA = createMockCanvasImageSource(100, 100);
    const sourceB = createMockCanvasImageSource(200, 200);
    const layers: CompositeLayer[] = [
      { source: sourceA, opacity: 1, zIndex: 0 },
      { source: sourceB, opacity: 0.5, zIndex: 1 },
    ];

    // Track submission order
    let submitCalled = false;
    mockDevice.queue.submit.mockImplementation(() => {
      // At the time of submission, layer textures should NOT be destroyed yet
      for (const tex of layerTextures) {
        expect(tex.destroy).not.toHaveBeenCalled();
      }
      submitCalled = true;
    });

    await compositor.composite(layers);

    expect(submitCalled).toBe(true);
    // After composite completes, layer textures should be destroyed
    for (const tex of layerTextures) {
      expect(tex.destroy).toHaveBeenCalled();
    }
  });

  it('resize recreates output texture', async () => {
    const { createGPUCompositor } = await import('../src/gpu-compositor.js');
    const compositor = await createGPUCompositor(1920, 1080);

    const initialCreateTextureCount = mockDevice.createTexture.mock.calls.length;
    const initialDestroyCount = mockDevice._mockTexture.destroy.mock.calls.length;

    compositor.resize(1280, 720);

    // Should destroy old texture and create new one
    expect(mockDevice._mockTexture.destroy.mock.calls.length).toBeGreaterThan(initialDestroyCount);
    expect(mockDevice.createTexture.mock.calls.length).toBeGreaterThan(initialCreateTextureCount);
  });

  it('destroy releases GPU resources', async () => {
    const { createGPUCompositor } = await import('../src/gpu-compositor.js');
    const compositor = await createGPUCompositor(1920, 1080);

    compositor.destroy();

    expect(mockDevice._mockTexture.destroy).toHaveBeenCalled();
    expect(mockDevice.destroy).toHaveBeenCalled();
  });

  it('requests an alpha-enabled 2D context on the readback canvas — fully-transparent output must stay transparent after readback', async () => {
    // Re-stub OffscreenCanvas with a getContext spy so we can inspect the args
    // on the readback canvas created inside composite().
    const readbackGetContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      putImageData: vi.fn(),
      globalAlpha: 1,
    });
    vi.stubGlobal('OffscreenCanvas', vi.fn().mockImplementation((w: number, h: number) => ({
      width: w,
      height: h,
      getContext: readbackGetContext,
    })));

    const { createGPUCompositor } = await import('../src/gpu-compositor.js');
    const compositor = await createGPUCompositor(100, 100);
    await compositor.composite([]); // empty → still runs readback path

    expect(readbackGetContext).toHaveBeenCalledWith('2d', { alpha: true });
  });

  it('unpremultiplies pixel data before putImageData — semi-transparent alpha-blended edges must not be darkened', async () => {
    // The fragment shader outputs premultiplied RGB. A pixel that is red at
    // 50% opacity is stored in the GPU texture as (128, 0, 0, 128) (pre-mul).
    // After readback, we must unpremultiply to (255, 0, 0, 128) before handing
    // the bytes to putImageData, which treats its input as straight alpha —
    // otherwise the canvas double-premultiplies and produces a dimmed color.
    const width = 2;
    const height = 1;
    const bytesPerRow = Math.ceil(width * 4 / 256) * 256; // 256 (padded)
    const stagingBufferSize = bytesPerRow * height;

    // Stage premultiplied data: pixel 0 = (128,0,0,128) [semi-transparent red],
    // pixel 1 = (255,255,255,255) [opaque white, unchanged by unpremul].
    const stagingBytes = new Uint8Array(stagingBufferSize);
    stagingBytes[0] = 128; stagingBytes[1] = 0; stagingBytes[2] = 0; stagingBytes[3] = 128;
    stagingBytes[4] = 255; stagingBytes[5] = 255; stagingBytes[6] = 255; stagingBytes[7] = 255;

    // Override the staging buffer's getMappedRange to return our pixel data.
    mockDevice.createBuffer.mockImplementation((descriptor: { size: number; usage: number }) => {
      // Only the staging (readback) buffer uses MAP_READ; everything else gets zeros.
      const isStaging = (descriptor.usage & 0x0001) !== 0; // GPUBufferUsage.MAP_READ
      return {
        destroy: vi.fn(),
        mapAsync: vi.fn().mockResolvedValue(undefined),
        getMappedRange: vi.fn().mockReturnValue(
          isStaging ? stagingBytes.buffer : new ArrayBuffer(descriptor.size),
        ),
        unmap: vi.fn(),
      };
    });

    // Capture the ImageData handed to putImageData.
    const putImageData = vi.fn();
    const capturedImageData: Array<{ data: Uint8ClampedArray; width: number; height: number }> = [];
    vi.stubGlobal('OffscreenCanvas', vi.fn().mockImplementation((w: number, h: number) => ({
      width: w,
      height: h,
      getContext: vi.fn().mockReturnValue({
        drawImage: vi.fn(),
        clearRect: vi.fn(),
        putImageData,
        globalAlpha: 1,
      }),
    })));
    vi.stubGlobal('ImageData', vi.fn().mockImplementation(
      (data: Uint8ClampedArray, w: number, h: number) => {
        const record = { data, width: w, height: h };
        capturedImageData.push(record);
        return record;
      },
    ));

    const { createGPUCompositor } = await import('../src/gpu-compositor.js');
    const compositor = await createGPUCompositor(width, height);
    await compositor.composite([]);

    expect(putImageData).toHaveBeenCalledTimes(1);
    expect(capturedImageData.length).toBe(1);
    const result = capturedImageData[0].data;
    // Semi-transparent pixel: (128,0,0,128) premul → (255,0,0,128) straight.
    expect(result[0]).toBe(255);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
    expect(result[3]).toBe(128);
    // Opaque pixel: unchanged by unpremul.
    expect(result[4]).toBe(255);
    expect(result[5]).toBe(255);
    expect(result[6]).toBe(255);
    expect(result[7]).toBe(255);
  });
});

describe('createCompositor factory', () => {
  let mockDevice: ReturnType<typeof createMockGPUDevice>;
  let mockAdapter: ReturnType<typeof createMockGPUAdapter>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDevice = createMockGPUDevice();
    mockAdapter = createMockGPUAdapter(mockDevice);

    vi.stubGlobal('OffscreenCanvas', vi.fn().mockImplementation((w: number, h: number) => {
      const ctx = {
        drawImage: vi.fn(),
        clearRect: vi.fn(),
        putImageData: vi.fn(),
        globalAlpha: 1,
      };
      return {
        width: w,
        height: h,
        getContext: vi.fn().mockReturnValue(ctx),
      };
    }));

    vi.stubGlobal('ImageData', vi.fn().mockImplementation((data: Uint8ClampedArray, w: number, h: number) => ({
      data,
      width: w,
      height: h,
    })));

    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(createMockImageBitmap()));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns canvas2d compositor when type is canvas2d', async () => {
    const { createCompositor } = await import('../src/compositor.js');
    const compositor = await createCompositor(1920, 1080, 'canvas2d');
    expect(compositor).toBeDefined();
    expect(compositor.composite).toBeTypeOf('function');
  });

  it('returns GPU compositor when type is gpu and WebGPU is available', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        ...globalThis.navigator,
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
        },
      },
      writable: true,
      configurable: true,
    });

    const { createCompositor } = await import('../src/compositor.js');
    const compositor = await createCompositor(1920, 1080, 'gpu');
    expect(compositor).toBeDefined();
  });

  it('throws when type is gpu but WebGPU is not available', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: undefined },
      writable: true,
      configurable: true,
    });

    const { createCompositor } = await import('../src/compositor.js');
    await expect(createCompositor(1920, 1080, 'gpu')).rejects.toThrow('WebGPU not available');
  });

  it('falls back to canvas2d when auto and WebGPU is not available', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: undefined },
      writable: true,
      configurable: true,
    });

    const { createCompositor } = await import('../src/compositor.js');
    const compositor = await createCompositor(1920, 1080, 'auto');
    expect(compositor).toBeDefined();
    expect(compositor.composite).toBeTypeOf('function');
  });

  it('defaults to auto detection', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: undefined },
      writable: true,
      configurable: true,
    });

    const { createCompositor } = await import('../src/compositor.js');
    const compositor = await createCompositor(1920, 1080);
    expect(compositor).toBeDefined();
  });
});
