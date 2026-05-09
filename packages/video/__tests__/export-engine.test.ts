import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FrameRenderer, RenderedFrame, MediaDecoder, OfflineAudioRenderer } from '../src/types.js';
import {
  createMockComposition,
  createMockTrack,
  createMockClip,
  createMockAssetResolver,
  createMockMediaDecoder,
  createMockCompositor,
  createMockFrameRenderer,
  createMockImageBitmap,
  createMockAudioBuffer,
} from './helpers.js';

// ── Mock mediabunny ──────────────────────────────────────────────────────────

const mockVideoSourceAdd = vi.fn().mockResolvedValue(undefined);
const mockVideoSourceClose = vi.fn();
const mockAudioSourceAdd = vi.fn().mockResolvedValue(undefined);
const mockAudioSourceClose = vi.fn();
const mockOutputStart = vi.fn().mockResolvedValue(undefined);
const mockOutputFinalize = vi.fn().mockResolvedValue(undefined);
const mockAddVideoTrack = vi.fn();
const mockAddAudioTrack = vi.fn();
const mockTargetBuffer = new ArrayBuffer(128);

vi.mock('mediabunny', () => ({
  Output: vi.fn().mockImplementation(() => ({
    addVideoTrack: mockAddVideoTrack,
    addAudioTrack: mockAddAudioTrack,
    start: mockOutputStart,
    finalize: mockOutputFinalize,
  })),
  CanvasSource: vi.fn().mockImplementation(() => ({
    add: mockVideoSourceAdd,
    close: mockVideoSourceClose,
  })),
  AudioBufferSource: vi.fn().mockImplementation(() => ({
    add: mockAudioSourceAdd,
    close: mockAudioSourceClose,
  })),
  Mp4OutputFormat: vi.fn().mockImplementation(() => ({ type: 'mp4' })),
  WebMOutputFormat: vi.fn().mockImplementation(() => ({ type: 'webm' })),
  BufferTarget: vi.fn().mockImplementation(() => ({
    get buffer() { return mockTargetBuffer; },
  })),
}));

// ── Mock subsystem factories ────────────────────────────────────────────────

let mockDecoder: ReturnType<typeof createMockMediaDecoder>;
let mockCompositor: ReturnType<typeof createMockCompositor>;
let mockFrameRenderer: ReturnType<typeof createMockFrameRenderer>;
let mockOfflineAudioRenderer: OfflineAudioRenderer;
let mockAudioBuffer: AudioBuffer;

vi.mock('../src/media-decoder.js', () => ({
  createMediaDecoder: vi.fn(() => mockDecoder),
}));

vi.mock('../src/compositor.js', () => ({
  createCompositor: vi.fn().mockImplementation(() => Promise.resolve(mockCompositor)),
}));

vi.mock('../src/frame-renderer.js', () => ({
  createFrameRenderer: vi.fn(() => mockFrameRenderer),
}));

vi.mock('../src/offline-audio-renderer.js', () => ({
  createOfflineAudioRenderer: vi.fn(() => mockOfflineAudioRenderer),
}));

// ── Mock OffscreenCanvas ────────────────────────────────────────────────────

const mockRenderCtx = {
  drawImage: vi.fn(),
  clearRect: vi.fn(),
};

vi.stubGlobal('OffscreenCanvas', vi.fn().mockImplementation((w: number, h: number) => ({
  width: w,
  height: h,
  getContext: vi.fn().mockReturnValue(mockRenderCtx),
})));

// Stub OfflineAudioContext — export-engine creates one just for decodeAudioData.
vi.stubGlobal('OfflineAudioContext', vi.fn().mockImplementation(() => ({
  decodeAudioData: vi.fn().mockRejectedValue(new Error('mock')),
  createBuffer: vi.fn(),
})));

// ── Import after mocks ──────────────────────────────────────────────────────

const { createExportEngine } = await import('../src/export-engine.js');
const { createFrameRenderer } = await import('../src/frame-renderer.js');
const { Mp4OutputFormat, WebMOutputFormat, CanvasSource } = await import('mediabunny');

describe('createExportEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockDecoder = createMockMediaDecoder();
    mockCompositor = createMockCompositor();
    mockFrameRenderer = createMockFrameRenderer();
    mockAudioBuffer = createMockAudioBuffer(5, 48000);
    mockOfflineAudioRenderer = {
      render: vi.fn().mockResolvedValue(mockAudioBuffer),
    };
  });

  // ── 1. Creates export engine ────────────────────────────────────────────────

  it('creates an export engine with correct interface', () => {
    const engine = createExportEngine();

    expect(engine).toBeDefined();
    expect(typeof engine.export).toBe('function');
    expect(typeof engine.onProgress).toBe('function');
    expect(typeof engine.abort).toBe('function');
  });

  // ── 2. Exports composition to Blob ──────────────────────────────────────────

  it('exports composition to a Blob', async () => {
    const engine = createExportEngine();
    const composition = createMockComposition({
      duration: 0.1,
      settings: {
        width: 640,
        height: 480,
        fps: 30,
        aspectRatio: '4:3',
        sampleRate: 48000,
      },
      tracks: [
        createMockTrack({
          id: 'track-1',
          type: 'video',
          clips: [createMockClip({ startTime: 0, duration: 0.1 })],
        }),
      ],
    });
    const resolver = createMockAssetResolver();

    const blob = await engine.export(composition, {
      format: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      videoBitrate: 5_000_000,
      audioBitrate: 128_000,
    }, resolver);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('video/mp4');

    // Output pipeline was used
    expect(mockOutputStart).toHaveBeenCalledTimes(1);
    expect(mockOutputFinalize).toHaveBeenCalledTimes(1);
    expect(mockAddVideoTrack).toHaveBeenCalledTimes(1);
    expect(mockAddAudioTrack).toHaveBeenCalledTimes(1);

    // Mp4OutputFormat was used for mp4 format
    expect(Mp4OutputFormat).toHaveBeenCalled();
  });

  // ── 3. Reports progress ─────────────────────────────────────────────────────

  it('reports progress via callback', async () => {
    const engine = createExportEngine();
    const progressValues: number[] = [];
    engine.onProgress((p) => progressValues.push(p));

    const composition = createMockComposition({
      duration: 0.1,
      settings: {
        width: 640,
        height: 480,
        fps: 30,
        aspectRatio: '4:3',
        sampleRate: 48000,
      },
    });
    const resolver = createMockAssetResolver();

    await engine.export(composition, {
      format: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      videoBitrate: 5_000_000,
      audioBitrate: 128_000,
    }, resolver);

    expect(progressValues.length).toBeGreaterThanOrEqual(1);
    for (const v of progressValues) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  // ── 4. Abort cancels export ─────────────────────────────────────────────────

  it('abort cancels export with error', async () => {
    const engine = createExportEngine();

    // Make renderFrame slow so we can abort during it
    let renderCount = 0;
    mockFrameRenderer.renderFrame = vi.fn().mockImplementation(async () => {
      renderCount++;
      if (renderCount >= 2) {
        // Give abort a chance to fire
        await new Promise(r => setTimeout(r, 50));
      }
      return {
        image: createMockImageBitmap(640, 480),
        time: 0,
        width: 640,
        height: 480,
      } satisfies RenderedFrame;
    });

    const composition = createMockComposition({
      duration: 1, // many frames to give time to abort
      settings: {
        width: 640,
        height: 480,
        fps: 30,
        aspectRatio: '4:3',
        sampleRate: 48000,
      },
    });
    const resolver = createMockAssetResolver();

    const exportPromise = engine.export(composition, {
      format: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      videoBitrate: 5_000_000,
      audioBitrate: 128_000,
    }, resolver);

    // Abort after a short delay
    setTimeout(() => engine.abort(), 10);

    await expect(exportPromise).rejects.toThrow(/abort/i);
  });

  // ── 4b. Abort during audio render ───────────────────────────────────────────

  it('abort during audio rendering still cancels export', async () => {
    const engine = createExportEngine();

    // Make audio render slow so abort happens during it
    mockOfflineAudioRenderer.render = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 100));
      return mockAudioBuffer;
    });

    const composition = createMockComposition({
      duration: 0.03, // 1 frame at 30fps — video finishes quickly
      settings: {
        width: 640,
        height: 480,
        fps: 30,
        aspectRatio: '4:3',
        sampleRate: 48000,
      },
    });
    const resolver = createMockAssetResolver();

    const exportPromise = engine.export(composition, {
      format: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      videoBitrate: 5_000_000,
      audioBitrate: 128_000,
    }, resolver);

    // Abort after video frames complete but during audio render
    setTimeout(() => engine.abort(), 20);

    await expect(exportPromise).rejects.toThrow(/abort/i);
  });

  // ── 5. Uses WebM format when specified ──────────────────────────────────────

  it('uses WebMOutputFormat when format is webm', async () => {
    const engine = createExportEngine();
    const composition = createMockComposition({
      duration: 0.1,
      settings: {
        width: 640,
        height: 480,
        fps: 30,
        aspectRatio: '4:3',
        sampleRate: 48000,
      },
    });
    const resolver = createMockAssetResolver();

    const blob = await engine.export(composition, {
      format: 'webm',
      videoCodec: 'vp9',
      audioCodec: 'opus',
      videoBitrate: 5_000_000,
      audioBitrate: 128_000,
    }, resolver);

    expect(blob.type).toBe('video/webm');
    expect(WebMOutputFormat).toHaveBeenCalled();
  });

  // ── 6. Encodes audio via OfflineAudioRenderer ──────────────────────────────

  it('encodes audio via OfflineAudioRenderer', async () => {
    const engine = createExportEngine();
    const composition = createMockComposition({
      duration: 0.1,
      settings: {
        width: 640,
        height: 480,
        fps: 30,
        aspectRatio: '4:3',
        sampleRate: 48000,
      },
    });
    const resolver = createMockAssetResolver();

    await engine.export(composition, {
      format: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      videoBitrate: 5_000_000,
      audioBitrate: 128_000,
    }, resolver);

    expect(mockOfflineAudioRenderer.render).toHaveBeenCalledTimes(1);
    expect(mockOfflineAudioRenderer.render).toHaveBeenCalledWith(
      composition,
      resolver,
      expect.any(Function),
    );
    expect(mockAudioSourceAdd).toHaveBeenCalledWith(mockAudioBuffer);
    expect(mockAudioSourceClose).toHaveBeenCalledTimes(1);
  });

  // ── 7. Unsubscribe progress ─────────────────────────────────────────────────

  it('onProgress returns unsubscribe function', async () => {
    const engine = createExportEngine();
    const values: number[] = [];
    const unsub = engine.onProgress((p) => values.push(p));

    unsub();

    const composition = createMockComposition({
      duration: 0.1,
      settings: {
        width: 640,
        height: 480,
        fps: 30,
        aspectRatio: '4:3',
        sampleRate: 48000,
      },
    });

    await engine.export(composition, {
      format: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      videoBitrate: 5_000_000,
      audioBitrate: 128_000,
    }, createMockAssetResolver());

    expect(values).toHaveLength(0);
  });

  // ── 8. Uses custom fps/width/height from options ────────────────────────────

  it('uses fps/width/height from options when provided', async () => {
    const engine = createExportEngine();
    const composition = createMockComposition({
      duration: 0.1,
      settings: {
        width: 1920,
        height: 1080,
        fps: 30,
        aspectRatio: '16:9',
        sampleRate: 48000,
      },
    });

    await engine.export(composition, {
      format: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      videoBitrate: 5_000_000,
      audioBitrate: 128_000,
      fps: 60,
      width: 640,
      height: 480,
    }, createMockAssetResolver());

    // OffscreenCanvas should be created with custom dimensions
    expect(OffscreenCanvas).toHaveBeenCalledWith(640, 480);

    // Total frames = ceil(0.1 * 60) = 6
    expect(mockFrameRenderer.renderFrame).toHaveBeenCalledTimes(6);
  });

  // ── Preview frame option ─────────────────────────────────────────────

  it('default: includePreviewFrames=false (export = finished cut)', async () => {
    const engine = createExportEngine();
    const composition = createMockComposition({
      duration: 0.05,
      tracks: [createMockTrack({ id: 'vt', clips: [createMockClip({ duration: 0.05 })] })],
    });
    await engine.export(composition, {
      format: 'mp4', videoCodec: 'avc', audioCodec: 'aac',
      videoBitrate: 5_000_000, audioBitrate: 128_000,
    }, createMockAssetResolver());

    expect(createFrameRenderer).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.any(Number), expect.any(Number),
      expect.objectContaining({ includePreviewFrames: false }),
    );
  });

  it('opt-in: includePreviewFrames=true is forwarded to FrameRenderer', async () => {
    const engine = createExportEngine({ includePreviewFrames: true });
    const composition = createMockComposition({
      duration: 0.05,
      tracks: [createMockTrack({ id: 'vt', clips: [createMockClip({ duration: 0.05 })] })],
    });
    await engine.export(composition, {
      format: 'mp4', videoCodec: 'avc', audioCodec: 'aac',
      videoBitrate: 5_000_000, audioBitrate: 128_000,
    }, createMockAssetResolver());

    expect(createFrameRenderer).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.any(Number), expect.any(Number),
      expect.objectContaining({ includePreviewFrames: true }),
    );
  });
});
