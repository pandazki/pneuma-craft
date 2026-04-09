import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCanvas2DCompositor } from '../src/canvas2d-compositor.js';
import type { CompositeLayer } from '../src/types.js';
import { createMockCanvasImageSource, createMockImageBitmap } from './helpers.js';

// Mock OffscreenCanvas and createImageBitmap for Node/Bun environment
const mockCtx = {
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  globalAlpha: 1,
};

const mockCanvas = {
  width: 1920,
  height: 1080,
  getContext: vi.fn().mockReturnValue(mockCtx),
};

vi.stubGlobal('OffscreenCanvas', vi.fn().mockImplementation((w: number, h: number) => ({
  ...mockCanvas,
  width: w,
  height: h,
  getContext: mockCanvas.getContext,
})));

vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(createMockImageBitmap()));

describe('Canvas2DCompositor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.globalAlpha = 1;
    // Re-stub after clearAllMocks so stubs still return values
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(createMockImageBitmap()));
    vi.stubGlobal('OffscreenCanvas', vi.fn().mockImplementation((w: number, h: number) => ({
      ...mockCanvas,
      width: w,
      height: h,
      getContext: vi.fn().mockReturnValue(mockCtx),
    })));
  });

  it('creates compositor with specified dimensions', () => {
    const compositor = createCanvas2DCompositor(1920, 1080);
    expect(compositor).toBeDefined();
    expect(compositor.composite).toBeTypeOf('function');
    expect(compositor.resize).toBeTypeOf('function');
    expect(compositor.destroy).toBeTypeOf('function');
  });

  it('composites empty layer list', async () => {
    const compositor = createCanvas2DCompositor(1920, 1080);
    const result = await compositor.composite([]);

    expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
    expect(result).toBeDefined();
    expect(result.width).toBe(1920);
  });

  it('composites single layer with full opacity', async () => {
    const source = createMockCanvasImageSource();
    const layers: CompositeLayer[] = [
      { source, opacity: 1, zIndex: 0 },
    ];

    const compositor = createCanvas2DCompositor(1920, 1080);
    await compositor.composite(layers);

    expect(mockCtx.drawImage).toHaveBeenCalledWith(source, 0, 0, 1920, 1080);
  });

  it('composites layer with partial opacity', async () => {
    const source = createMockCanvasImageSource();
    const layers: CompositeLayer[] = [
      { source, opacity: 0.5, zIndex: 0 },
    ];

    const compositor = createCanvas2DCompositor(1920, 1080);
    await compositor.composite(layers);

    expect(mockCtx.drawImage).toHaveBeenCalledWith(source, 0, 0, 1920, 1080);
  });

  it('sorts layers by zIndex (low first = bottom)', async () => {
    const sourceA = createMockCanvasImageSource(100, 100);
    const sourceB = createMockCanvasImageSource(200, 200);
    const layers: CompositeLayer[] = [
      { source: sourceB, opacity: 1, zIndex: 2 },
      { source: sourceA, opacity: 1, zIndex: 1 },
    ];

    const compositor = createCanvas2DCompositor(1920, 1080);
    await compositor.composite(layers);

    const drawCalls = mockCtx.drawImage.mock.calls;
    expect(drawCalls.length).toBe(2);
    expect(drawCalls[0][0]).toBe(sourceA);
    expect(drawCalls[1][0]).toBe(sourceB);
  });

  it('skips layers with zero opacity', async () => {
    const source = createMockCanvasImageSource();
    const layers: CompositeLayer[] = [
      { source, opacity: 0, zIndex: 0 },
    ];

    const compositor = createCanvas2DCompositor(1920, 1080);
    await compositor.composite(layers);

    expect(mockCtx.drawImage).not.toHaveBeenCalled();
  });

  it('resize updates dimensions', async () => {
    const compositor = createCanvas2DCompositor(1920, 1080);
    compositor.resize(1280, 720);

    const source = createMockCanvasImageSource();
    await compositor.composite([{ source, opacity: 1, zIndex: 0 }]);

    expect(mockCtx.drawImage).toHaveBeenCalledWith(source, 0, 0, 1280, 720);
  });

  it('destroy is callable', () => {
    const compositor = createCanvas2DCompositor(1920, 1080);
    expect(() => compositor.destroy()).not.toThrow();
  });
});
