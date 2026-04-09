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
