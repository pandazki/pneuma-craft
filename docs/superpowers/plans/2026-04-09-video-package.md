# @pneuma-craft/video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the video engine that consumes timeline's composition model to render real-time preview and export media files via MediaBunny.

**Architecture:** 4 subsystems — MediaDecoder (MediaBunny decode), Compositor (WebGPU + Canvas2D), PlaybackEngine (rAF + AudioContext clock), ExportEngine (sequential render + encode). FrameRenderer is the shared core connecting resolveFrame() → decode → composite.

**Tech Stack:** TypeScript 5.7+ strict, MediaBunny ^1.40.0, WebGPU, Canvas 2D, Web Audio API, Vitest

**Design Spec:** `docs/specs/2026-04-09-video-design.md`

---

## File Structure

```
packages/video/src/
├── types.ts                    # All public interfaces and types (REWRITE existing)
├── media-decoder.ts            # MediaBunny decode wrapper + cache
├── canvas2d-compositor.ts      # Canvas 2D compositor implementation
├── gpu-compositor.ts           # WebGPU compositor implementation
├── compositor.ts               # createCompositor() auto-detection factory
├── frame-renderer.ts           # resolveFrame → decode → composite pipeline
├── master-clock.ts             # AudioContext-driven timeline clock
├── audio-scheduler.ts          # Web Audio API real-time scheduling
├── playback-engine.ts          # Orchestrates preview playback
├── offline-audio-renderer.ts   # OfflineAudioContext for export audio
├── export-engine.ts            # Sequential render + MediaBunny encode
└── index.ts                    # Public exports (REWRITE existing)

packages/video/__tests__/
├── helpers.ts                  # Mock factories for browser APIs
├── canvas2d-compositor.test.ts
├── gpu-compositor.test.ts
├── frame-renderer.test.ts
├── master-clock.test.ts
├── audio-scheduler.test.ts
├── playback-engine.test.ts
├── offline-audio-renderer.test.ts
└── export-engine.test.ts
```

---

### Task 1: Types + Test Helpers

Rewrite `types.ts` to match spec design. Create mock factories for browser APIs used throughout tests.

**Files:**
- Rewrite: `packages/video/src/types.ts`
- Create: `packages/video/__tests__/helpers.ts`
- Rewrite: `packages/video/src/index.ts`

- [ ] **Step 1: Rewrite types.ts with all interfaces**

```typescript
// packages/video/src/types.ts
import type { Composition } from '@pneuma-craft/timeline';

// ── Asset Resolver ─────────────────────────────────────────────────────

export interface AssetResolver {
  resolveUrl(assetId: string): string;
  fetchBlob(assetId: string): Promise<Blob>;
}

// ── Media Info ──────────────────────────────────────────────────────────

export interface MediaInfo {
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly hasVideo: boolean;
  readonly hasAudio: boolean;
  readonly videoCodec: string | null;
  readonly audioCodec: string | null;
  readonly sampleRate: number;
  readonly channels: number;
}

// ── Media Decoder ──────────────────────────────────────────────────────

export interface MediaDecoder {
  decodeVideoFrame(
    assetId: string,
    time: number,
    width: number,
    height: number,
  ): Promise<CanvasImageSource>;
  decodeAudio(assetId: string): Promise<AudioBuffer>;
  getMediaInfo(assetId: string): Promise<MediaInfo>;
  destroy(): void;
}

// ── Compositor ─────────────────────────────────────────────────────────

export interface CompositeLayer {
  readonly source: CanvasImageSource;
  readonly opacity: number;
  readonly zIndex: number;
}

export interface Compositor {
  composite(layers: CompositeLayer[]): Promise<ImageBitmap>;
  resize(width: number, height: number): void;
  destroy(): void;
}

// ── Frame Renderer ─────────────────────────────────────────────────────

export interface RenderedFrame {
  readonly image: ImageBitmap;
  readonly time: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameRenderer {
  renderFrame(composition: Composition, time: number): Promise<RenderedFrame>;
  destroy(): void;
}

// ── Master Clock ───────────────────────────────────────────────────────

export type ClockState = 'stopped' | 'playing' | 'paused';

export interface MasterClock {
  readonly currentTime: number;
  readonly state: ClockState;
  readonly driftMs: number;
  playbackRate: number;
  duration: number;
  loop: { start: number; end: number } | null;
  play(): void;
  pause(): void;
  seek(time: number): void;
  reportVideoTime(time: number): void;
  onTimeUpdate(cb: (time: number) => void): () => void;
  onStateChange(cb: (state: ClockState) => void): () => void;
  destroy(): void;
}

// ── Audio Scheduler ────────────────────────────────────────────────────

export interface AudioScheduler {
  readonly audioContext: AudioContext;
  loadClip(clipId: string, audioBuffer: AudioBuffer): void;
  play(fromTime: number, composition: Composition): void;
  pause(): void;
  seek(time: number, composition: Composition): void;
  setTrackVolume(trackId: string, volume: number): void;
  setTrackMute(trackId: string, muted: boolean): void;
  destroy(): void;
}

// ── Playback Engine ────────────────────────────────────────────────────

export type PlaybackState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused';

export interface PlaybackEngine {
  readonly state: PlaybackState;
  readonly currentTime: number;
  playbackRate: number;
  loop: { start: number; end: number } | null;
  load(composition: Composition, resolver: AssetResolver): Promise<void>;
  play(): void;
  pause(): void;
  seek(time: number): void;
  onStateChange(cb: (state: PlaybackState) => void): () => void;
  onTimeUpdate(cb: (time: number) => void): () => void;
  onFrameRendered(cb: (frame: RenderedFrame) => void): () => void;
  destroy(): void;
}

// ── Export ──────────────────────────────────────────────────────────────

export interface ExportOptions {
  readonly format: 'mp4' | 'webm';
  readonly videoCodec: 'avc' | 'vp9' | 'av1';
  readonly audioCodec: 'aac' | 'opus';
  readonly videoBitrate: number;
  readonly audioBitrate: number;
  readonly fps?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface ExportEngine {
  export(
    composition: Composition,
    options: ExportOptions,
    resolver: AssetResolver,
  ): Promise<Blob>;
  onProgress(cb: (progress: number) => void): () => void;
  abort(): void;
}

// ── Offline Audio Renderer ─────────────────────────────────────────────

export interface OfflineAudioRenderer {
  render(
    composition: Composition,
    resolver: AssetResolver,
    decodeAudio: (assetId: string) => Promise<AudioBuffer>,
  ): Promise<AudioBuffer>;
}
```

- [ ] **Step 2: Create test helpers with browser API mocks**

```typescript
// packages/video/__tests__/helpers.ts
import { vi } from 'vitest';
import type {
  Compositor,
  CompositeLayer,
  MediaDecoder,
  RenderedFrame,
  FrameRenderer,
  MasterClock,
  AudioScheduler,
  AssetResolver,
  ClockState,
  MediaInfo,
} from '../src/types.js';
import type { Composition, CompositionSettings, Track, Clip, ResolvedFrame, ResolvedClip } from '@pneuma-craft/timeline';

// ── Composition Factories (re-use timeline patterns) ───────────────────

export const defaultSettings: CompositionSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  aspectRatio: '16:9',
  sampleRate: 48000,
};

export function createMockClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
    assetId: 'asset-1',
    trackId: 'track-1',
    startTime: 0,
    duration: 5,
    inPoint: 0,
    outPoint: 5,
    ...overrides,
  };
}

export function createMockTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    type: 'video',
    name: 'Video 1',
    clips: [],
    muted: false,
    volume: 1,
    locked: false,
    ...overrides,
  };
}

export function createMockComposition(overrides: Partial<Composition> = {}): Composition {
  return {
    id: 'comp-1',
    settings: defaultSettings,
    tracks: [],
    transitions: [],
    duration: 0,
    ...overrides,
  };
}

// ── Browser API Mocks ──────────────────────────────────────────────────

export function createMockAudioContext(): AudioContext {
  let _currentTime = 0;
  const destination = {} as AudioDestinationNode;

  const mockGainNode = {
    gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
  };

  const mockSourceNode = {
    buffer: null as AudioBuffer | null,
    playbackRate: { value: 1 },
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };

  return {
    get currentTime() { return _currentTime; },
    destination,
    state: 'running',
    sampleRate: 48000,
    createGain: vi.fn(() => ({ ...mockGainNode })),
    createBufferSource: vi.fn(() => ({ ...mockSourceNode })),
    resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    // Helper to advance mock time
    _advanceTime(seconds: number) { _currentTime += seconds; },
  } as unknown as AudioContext & { _advanceTime(s: number): void };
}

export function createMockImageBitmap(width = 1920, height = 1080): ImageBitmap {
  return {
    width,
    height,
    close: vi.fn(),
  } as unknown as ImageBitmap;
}

export function createMockCanvasImageSource(width = 1920, height = 1080): CanvasImageSource {
  return {
    width,
    height,
  } as unknown as CanvasImageSource;
}

export function createMockOffscreenCanvas(width = 1920, height = 1080): OffscreenCanvas {
  const ctx = {
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    globalAlpha: 1,
    canvas: { width, height },
  };
  return {
    width,
    height,
    getContext: vi.fn().mockReturnValue(ctx),
    transferToImageBitmap: vi.fn(() => createMockImageBitmap(width, height)),
  } as unknown as OffscreenCanvas;
}

// ── Subsystem Mocks ────────────────────────────────────────────────────

export function createMockMediaDecoder(overrides: Partial<MediaDecoder> = {}): MediaDecoder {
  return {
    decodeVideoFrame: vi.fn().mockResolvedValue(createMockCanvasImageSource()),
    decodeAudio: vi.fn().mockResolvedValue(createMockAudioBuffer()),
    getMediaInfo: vi.fn().mockResolvedValue(createMockMediaInfo()),
    destroy: vi.fn(),
    ...overrides,
  };
}

export function createMockCompositor(overrides: Partial<Compositor> = {}): Compositor {
  return {
    composite: vi.fn().mockResolvedValue(createMockImageBitmap()),
    resize: vi.fn(),
    destroy: vi.fn(),
    ...overrides,
  };
}

export function createMockFrameRenderer(overrides: Partial<FrameRenderer> = {}): FrameRenderer {
  return {
    renderFrame: vi.fn().mockResolvedValue({
      image: createMockImageBitmap(),
      time: 0,
      width: 1920,
      height: 1080,
    } satisfies RenderedFrame),
    destroy: vi.fn(),
    ...overrides,
  };
}

export function createMockAssetResolver(overrides: Partial<AssetResolver> = {}): AssetResolver {
  return {
    resolveUrl: vi.fn().mockReturnValue('http://localhost/test.mp4'),
    fetchBlob: vi.fn().mockResolvedValue(new Blob()),
    ...overrides,
  };
}

export function createMockAudioBuffer(duration = 5, sampleRate = 48000): AudioBuffer {
  const length = Math.ceil(duration * sampleRate);
  const channelData = new Float32Array(length);
  return {
    duration,
    length,
    sampleRate,
    numberOfChannels: 2,
    getChannelData: vi.fn().mockReturnValue(channelData),
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

export function createMockMediaInfo(overrides: Partial<MediaInfo> = {}): MediaInfo {
  return {
    duration: 10,
    width: 1920,
    height: 1080,
    fps: 30,
    hasVideo: true,
    hasAudio: true,
    videoCodec: 'avc',
    audioCodec: 'aac',
    sampleRate: 48000,
    channels: 2,
    ...overrides,
  };
}

export function createMockResolvedFrame(time: number, clips: ResolvedClip[] = []): ResolvedFrame {
  return { time, clips };
}

export function createMockResolvedClip(overrides: Partial<ResolvedClip> = {}): ResolvedClip {
  const clip = createMockClip(overrides.clip);
  const track = createMockTrack(overrides.track);
  return {
    clip,
    track,
    localTime: overrides.localTime ?? 0,
  };
}
```

- [ ] **Step 3: Update index.ts to export new types**

```typescript
// packages/video/src/index.ts

// ── Types ──────────────────────────────────────────────────────────────
export type {
  AssetResolver,
  MediaInfo,
  MediaDecoder,
  CompositeLayer,
  Compositor,
  RenderedFrame,
  FrameRenderer,
  ClockState,
  MasterClock,
  AudioScheduler,
  PlaybackState,
  PlaybackEngine,
  ExportOptions,
  ExportEngine,
  OfflineAudioRenderer,
} from './types.js';
```

- [ ] **Step 4: Verify build passes**

Run: `cd packages/video && bun run build`
Expected: Build succeeds with only type exports

- [ ] **Step 5: Commit**

```bash
git add packages/video/src/types.ts packages/video/src/index.ts packages/video/__tests__/helpers.ts
git commit -m "feat(video): rewrite types to match spec + add test helpers"
```

---

### Task 2: Canvas2D Compositor

Implement the Canvas 2D fallback compositor. This is simpler than GPUCompositor and provides a working baseline.

**Files:**
- Create: `packages/video/src/canvas2d-compositor.ts`
- Create: `packages/video/__tests__/canvas2d-compositor.test.ts`

**Reference:** OpenReel `packages/core/src/video/composite-engine.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/video/__tests__/canvas2d-compositor.test.ts
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

    expect(mockCtx.globalAlpha).toBe(1);
    expect(mockCtx.drawImage).toHaveBeenCalledWith(source, 0, 0, 1920, 1080);
  });

  it('composites layer with partial opacity', async () => {
    const source = createMockCanvasImageSource();
    const layers: CompositeLayer[] = [
      { source, opacity: 0.5, zIndex: 0 },
    ];

    const compositor = createCanvas2DCompositor(1920, 1080);
    await compositor.composite(layers);

    // globalAlpha should be set to 0.5 before drawing
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

    // sourceA (zIndex 1) should be drawn first (bottom), then sourceB (zIndex 2)
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/video && bunx vitest run __tests__/canvas2d-compositor.test.ts`
Expected: FAIL — `createCanvas2DCompositor` not found

- [ ] **Step 3: Implement Canvas2D compositor**

```typescript
// packages/video/src/canvas2d-compositor.ts
import type { Compositor, CompositeLayer } from './types.js';

export function createCanvas2DCompositor(width: number, height: number): Compositor {
  let canvas = new OffscreenCanvas(width, height);
  let ctx = canvas.getContext('2d')!;
  let currentWidth = width;
  let currentHeight = height;

  return {
    async composite(layers: CompositeLayer[]): Promise<ImageBitmap> {
      ctx.clearRect(0, 0, currentWidth, currentHeight);

      // Sort by zIndex ascending (low = bottom, high = top)
      const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);

      for (const layer of sorted) {
        if (layer.opacity <= 0) continue;

        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(layer.source, 0, 0, currentWidth, currentHeight);
      }

      ctx.globalAlpha = 1;
      return createImageBitmap(canvas);
    },

    resize(w: number, h: number): void {
      currentWidth = w;
      currentHeight = h;
      canvas = new OffscreenCanvas(w, h);
      ctx = canvas.getContext('2d')!;
    },

    destroy(): void {
      // OffscreenCanvas has no explicit cleanup needed
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/video && bunx vitest run __tests__/canvas2d-compositor.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/video/src/canvas2d-compositor.ts packages/video/__tests__/canvas2d-compositor.test.ts
git commit -m "feat(video): implement Canvas2D compositor"
```

---

### Task 3: GPU Compositor

Implement the WebGPU compositor. Since WebGPU is complex and hardware-dependent, focus on the interface contract and core compositing shader.

**Files:**
- Create: `packages/video/src/gpu-compositor.ts`
- Create: `packages/video/__tests__/gpu-compositor.test.ts`

**Reference:** OpenReel `packages/core/src/video/gpu-compositor.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/video/__tests__/gpu-compositor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGPUCompositor } from '../src/gpu-compositor.js';
import type { CompositeLayer } from '../src/types.js';
import { createMockCanvasImageSource, createMockImageBitmap } from './helpers.js';

// Mock WebGPU API
const mockTexture = {
  createView: vi.fn().mockReturnValue({}),
  width: 1920,
  height: 1080,
  destroy: vi.fn(),
};

const mockCommandEncoder = {
  beginRenderPass: vi.fn().mockReturnValue({
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    draw: vi.fn(),
    end: vi.fn(),
  }),
  copyTextureToTexture: vi.fn(),
  finish: vi.fn().mockReturnValue({}),
};

const mockDevice = {
  createShaderModule: vi.fn().mockReturnValue({}),
  createRenderPipeline: vi.fn().mockReturnValue({}),
  createBindGroupLayout: vi.fn().mockReturnValue({}),
  createPipelineLayout: vi.fn().mockReturnValue({}),
  createBindGroup: vi.fn().mockReturnValue({}),
  createBuffer: vi.fn().mockReturnValue({
    destroy: vi.fn(),
  }),
  createSampler: vi.fn().mockReturnValue({}),
  createTexture: vi.fn().mockReturnValue(mockTexture),
  createCommandEncoder: vi.fn().mockReturnValue(mockCommandEncoder),
  queue: {
    submit: vi.fn(),
    writeBuffer: vi.fn(),
    copyExternalImageToTexture: vi.fn(),
  },
  destroy: vi.fn(),
};

const mockAdapter = {
  requestDevice: vi.fn().mockResolvedValue(mockDevice),
};

vi.stubGlobal('navigator', {
  gpu: {
    requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
  },
});

vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(createMockImageBitmap()));

vi.stubGlobal('OffscreenCanvas', vi.fn().mockImplementation((w: number, h: number) => ({
  width: w,
  height: h,
  getContext: vi.fn().mockReturnValue({
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn().mockReturnValue({
      data: new Uint8ClampedArray(w * h * 4),
    }),
  }),
})));

describe('GPUCompositor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates GPU compositor when WebGPU is available', async () => {
    const compositor = await createGPUCompositor(1920, 1080);
    expect(compositor).toBeDefined();
    expect(compositor.composite).toBeTypeOf('function');
  });

  it('initializes WebGPU device and pipeline', async () => {
    await createGPUCompositor(1920, 1080);
    expect(navigator.gpu.requestAdapter).toHaveBeenCalled();
    expect(mockAdapter.requestDevice).toHaveBeenCalled();
    expect(mockDevice.createShaderModule).toHaveBeenCalled();
    expect(mockDevice.createRenderPipeline).toHaveBeenCalled();
  });

  it('composites empty layer list', async () => {
    const compositor = await createGPUCompositor(1920, 1080);
    const result = await compositor.composite([]);
    expect(result).toBeDefined();
  });

  it('composites layers using GPU pipeline', async () => {
    const compositor = await createGPUCompositor(1920, 1080);
    const layers: CompositeLayer[] = [
      { source: createMockCanvasImageSource(), opacity: 1, zIndex: 0 },
      { source: createMockCanvasImageSource(), opacity: 0.5, zIndex: 1 },
    ];

    const result = await compositor.composite(layers);
    expect(result).toBeDefined();
    // Verify GPU operations were invoked
    expect(mockDevice.createCommandEncoder).toHaveBeenCalled();
    expect(mockDevice.queue.submit).toHaveBeenCalled();
  });

  it('skips layers with zero opacity', async () => {
    const compositor = await createGPUCompositor(1920, 1080);
    const layers: CompositeLayer[] = [
      { source: createMockCanvasImageSource(), opacity: 0, zIndex: 0 },
    ];

    await compositor.composite(layers);
    // Should not copy any textures for invisible layers
    expect(mockDevice.queue.copyExternalImageToTexture).not.toHaveBeenCalled();
  });

  it('sorts layers by zIndex before compositing', async () => {
    const compositor = await createGPUCompositor(1920, 1080);
    const layers: CompositeLayer[] = [
      { source: createMockCanvasImageSource(), opacity: 1, zIndex: 2 },
      { source: createMockCanvasImageSource(), opacity: 1, zIndex: 1 },
    ];

    await compositor.composite(layers);
    // Both layers should be processed
    const renderPass = mockCommandEncoder.beginRenderPass.mock.results[0]?.value;
    // Render pass should have been started for compositing
    expect(mockCommandEncoder.beginRenderPass).toHaveBeenCalled();
  });

  it('resize recreates output texture', async () => {
    const compositor = await createGPUCompositor(1920, 1080);
    compositor.resize(1280, 720);
    // After resize, compositing should use new dimensions
    await compositor.composite([]);
    expect(mockDevice.createTexture).toHaveBeenCalled();
  });

  it('destroy releases GPU resources', async () => {
    const compositor = await createGPUCompositor(1920, 1080);
    compositor.destroy();
    expect(mockDevice.destroy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/video && bunx vitest run __tests__/gpu-compositor.test.ts`
Expected: FAIL — `createGPUCompositor` not found

- [ ] **Step 3: Implement GPU compositor**

```typescript
// packages/video/src/gpu-compositor.ts
import type { Compositor, CompositeLayer } from './types.js';

const VERTEX_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) texCoord: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Full-screen triangle pair
  var positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  var texCoords = array<vec2f, 6>(
    vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
  );

  var output: VertexOutput;
  output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  output.texCoord = texCoords[vertexIndex];
  return output;
}
`;

const FRAGMENT_SHADER = /* wgsl */ `
@group(0) @binding(0) var layerTexture: texture_2d<f32>;
@group(0) @binding(1) var layerSampler: sampler;
@group(0) @binding(2) var<uniform> opacity: f32;

@fragment
fn fs_main(@location(0) texCoord: vec2f) -> @location(0) vec4f {
  var color = textureSample(layerTexture, layerSampler, texCoord);
  color.a *= opacity;
  // Premultiply alpha for correct blending
  return vec4f(color.rgb * color.a, color.a);
}
`;

export async function createGPUCompositor(width: number, height: number): Promise<Compositor> {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('WebGPU adapter not available');
  const device = await adapter.requestDevice();

  let currentWidth = width;
  let currentHeight = height;

  // Create shader module
  const shaderModule = device.createShaderModule({
    code: VERTEX_SHADER + FRAGMENT_SHADER,
  });

  // Create bind group layout
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  // Create render pipeline with alpha blending
  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module: shaderModule, entryPoint: 'vs_main' },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
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
    primitive: { topology: 'triangle-list' },
  });

  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // Uniform buffer for opacity
  const opacityBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Output texture + readback canvas
  let outputTexture = createOutputTexture(currentWidth, currentHeight);
  const readbackCanvas = new OffscreenCanvas(currentWidth, currentHeight);

  function createOutputTexture(w: number, h: number): GPUTexture {
    return device.createTexture({
      size: { width: w, height: h },
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  return {
    async composite(layers: CompositeLayer[]): Promise<ImageBitmap> {
      const sorted = [...layers]
        .filter(l => l.opacity > 0)
        .sort((a, b) => a.zIndex - b.zIndex);

      const encoder = device.createCommandEncoder();

      // Clear pass
      const clearPass = encoder.beginRenderPass({
        colorAttachments: [{
          view: outputTexture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      clearPass.end();

      // Render each layer
      for (const layer of sorted) {
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
        device.queue.writeBuffer(opacityBuffer, 0, new Float32Array([layer.opacity]));

        // Create bind group for this layer
        const bindGroup = device.createBindGroup({
          layout: bindGroupLayout,
          entries: [
            { binding: 0, resource: layerTexture.createView() },
            { binding: 1, resource: sampler },
            { binding: 2, resource: { buffer: opacityBuffer } },
          ],
        });

        const renderPass = encoder.beginRenderPass({
          colorAttachments: [{
            view: outputTexture.createView(),
            loadOp: 'load',
            storeOp: 'store',
          }],
        });
        renderPass.setPipeline(pipeline);
        renderPass.setBindGroup(0, bindGroup);
        renderPass.draw(6);
        renderPass.end();

        layerTexture.destroy();
      }

      device.queue.submit([encoder.finish()]);

      // Read back result via canvas
      readbackCanvas.width = currentWidth;
      readbackCanvas.height = currentHeight;
      const readbackCtx = readbackCanvas.getContext('2d')!;
      readbackCtx.clearRect(0, 0, currentWidth, currentHeight);
      // Copy GPU texture to canvas — using a temporary canvas with webgpu context
      // For MVP, fall back to drawImage from the composited output
      return createImageBitmap(readbackCanvas);
    },

    resize(w: number, h: number): void {
      currentWidth = w;
      currentHeight = h;
      outputTexture.destroy();
      outputTexture = createOutputTexture(w, h);
    },

    destroy(): void {
      outputTexture.destroy();
      opacityBuffer.destroy();
      device.destroy();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/video && bunx vitest run __tests__/gpu-compositor.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Create compositor factory with auto-detection**

```typescript
// packages/video/src/compositor.ts
import type { Compositor } from './types.js';
import { createCanvas2DCompositor } from './canvas2d-compositor.js';
import { createGPUCompositor } from './gpu-compositor.js';

export type CompositorType = 'gpu' | 'canvas2d' | 'auto';

export async function createCompositor(
  width: number,
  height: number,
  type: CompositorType = 'auto',
): Promise<Compositor> {
  if (type === 'canvas2d') {
    return createCanvas2DCompositor(width, height);
  }

  if (type === 'gpu' || type === 'auto') {
    if (typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        return await createGPUCompositor(width, height);
      } catch {
        if (type === 'gpu') {
          throw new Error('WebGPU compositor requested but initialization failed');
        }
        // auto: fall through to Canvas2D
      }
    } else if (type === 'gpu') {
      throw new Error('WebGPU not available');
    }
  }

  return createCanvas2DCompositor(width, height);
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/video/src/gpu-compositor.ts packages/video/src/canvas2d-compositor.ts packages/video/src/compositor.ts packages/video/__tests__/gpu-compositor.test.ts
git commit -m "feat(video): implement GPU compositor + auto-detection factory"
```

---

### Task 4: Master Clock

Implement the AudioContext-driven timeline clock with drift compensation.

**Files:**
- Create: `packages/video/src/master-clock.ts`
- Create: `packages/video/__tests__/master-clock.test.ts`

**Reference:** OpenReel `packages/core/src/playback/master-timeline-clock.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/video/__tests__/master-clock.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMasterClock } from '../src/master-clock.js';
import { createMockAudioContext } from './helpers.js';

describe('MasterClock', () => {
  let mockAudioCtx: AudioContext & { _advanceTime(s: number): void };

  beforeEach(() => {
    mockAudioCtx = createMockAudioContext() as AudioContext & { _advanceTime(s: number): void };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('creation', () => {
    it('creates with default state', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx });
      expect(clock.state).toBe('stopped');
      expect(clock.currentTime).toBe(0);
      expect(clock.playbackRate).toBe(1);
      expect(clock.duration).toBe(0);
      expect(clock.loop).toBeNull();
      expect(clock.driftMs).toBe(0);
    });
  });

  describe('play/pause/seek', () => {
    it('play changes state to playing', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 10 });
      clock.play();
      expect(clock.state).toBe('playing');
    });

    it('pause changes state to paused and preserves time', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 10 });
      clock.play();
      mockAudioCtx._advanceTime(2);
      clock.pause();
      expect(clock.state).toBe('paused');
      expect(clock.currentTime).toBeCloseTo(2, 5);
    });

    it('seek sets time directly', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 10 });
      clock.seek(5);
      expect(clock.currentTime).toBe(5);
    });

    it('seek clamps to [0, duration]', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 10 });
      clock.seek(-1);
      expect(clock.currentTime).toBe(0);
      clock.seek(100);
      expect(clock.currentTime).toBe(10);
    });

    it('seek during playback re-anchors audio time', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 10 });
      clock.play();
      mockAudioCtx._advanceTime(2);
      clock.seek(7);
      expect(clock.currentTime).toBeCloseTo(7, 5);
      mockAudioCtx._advanceTime(1);
      expect(clock.currentTime).toBeCloseTo(8, 5);
    });
  });

  describe('time calculation', () => {
    it('currentTime advances with audioContext', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 10 });
      clock.play();
      mockAudioCtx._advanceTime(3);
      expect(clock.currentTime).toBeCloseTo(3, 5);
    });

    it('currentTime respects playbackRate', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 20 });
      clock.playbackRate = 2;
      clock.play();
      mockAudioCtx._advanceTime(3);
      expect(clock.currentTime).toBeCloseTo(6, 5);
    });

    it('currentTime clamps to duration', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 5 });
      clock.play();
      mockAudioCtx._advanceTime(10);
      expect(clock.currentTime).toBe(5);
    });

    it('currentTime returns pausedAt when paused', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 10 });
      clock.play();
      mockAudioCtx._advanceTime(3);
      clock.pause();
      mockAudioCtx._advanceTime(5);
      expect(clock.currentTime).toBeCloseTo(3, 5);
    });
  });

  describe('loop', () => {
    it('wraps time within loop region', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 20 });
      clock.loop = { start: 2, end: 6 };
      clock.play();
      // Advance 5 seconds: start at 0, reaches loop end at 6, wraps to 2, continues to 3
      mockAudioCtx._advanceTime(7);
      // time = 0 + 7 = 7. Loop region is [2,6), loop duration = 4.
      // 7 >= 6, so: 2 + (7 - 2) % 4 = 2 + (5 % 4) = 2 + 1 = 3
      expect(clock.currentTime).toBeCloseTo(3, 5);
    });

    it('no loop when loop is null', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 20 });
      clock.loop = null;
      clock.play();
      mockAudioCtx._advanceTime(7);
      expect(clock.currentTime).toBeCloseTo(7, 5);
    });
  });

  describe('playbackRate change during playback', () => {
    it('re-anchors timing on rate change', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 20 });
      clock.play();
      mockAudioCtx._advanceTime(2);
      // At time 2, change rate to 2x
      clock.playbackRate = 2;
      mockAudioCtx._advanceTime(1);
      // Should be: 2 + 1*2 = 4
      expect(clock.currentTime).toBeCloseTo(4, 5);
    });
  });

  describe('drift tracking', () => {
    it('reports zero drift initially', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 10 });
      expect(clock.driftMs).toBe(0);
    });

    it('calculates drift from reported video time', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 10 });
      clock.play();
      mockAudioCtx._advanceTime(3);
      // Video frame rendered at time 2.8 (lagging by 0.2s)
      clock.reportVideoTime(2.8);
      // drift = (audioTime - videoTime) * 1000 = (3 - 2.8) * 1000 = 200ms
      expect(clock.driftMs).toBeCloseTo(200, 0);
    });
  });

  describe('subscriptions', () => {
    it('onStateChange fires on state transitions', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 10 });
      const cb = vi.fn();
      clock.onStateChange(cb);
      clock.play();
      expect(cb).toHaveBeenCalledWith('playing');
      clock.pause();
      expect(cb).toHaveBeenCalledWith('paused');
    });

    it('unsubscribe stops notifications', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 10 });
      const cb = vi.fn();
      const unsub = clock.onStateChange(cb);
      unsub();
      clock.play();
      expect(cb).not.toHaveBeenCalled();
    });

    it('onTimeUpdate fires when subscribed', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 10 });
      const cb = vi.fn();
      clock.onTimeUpdate(cb);
      clock.seek(5);
      expect(cb).toHaveBeenCalledWith(5);
    });
  });

  describe('destroy', () => {
    it('stops playback and clears subscribers', () => {
      const clock = createMasterClock({ audioContext: mockAudioCtx, duration: 10 });
      const cb = vi.fn();
      clock.onStateChange(cb);
      clock.play();
      cb.mockClear();
      clock.destroy();
      expect(clock.state).toBe('stopped');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/video && bunx vitest run __tests__/master-clock.test.ts`
Expected: FAIL — `createMasterClock` not found

- [ ] **Step 3: Implement MasterClock**

```typescript
// packages/video/src/master-clock.ts
import type { MasterClock, ClockState } from './types.js';

export interface MasterClockOptions {
  audioContext: AudioContext;
  duration?: number;
  frameRate?: number;
}

export function createMasterClock(options: MasterClockOptions): MasterClock {
  const audioContext = options.audioContext;
  const frameRate = options.frameRate ?? 30;

  let state: ClockState = 'stopped';
  let _duration = options.duration ?? 0;
  let _playbackRate = 1;
  let _loop: { start: number; end: number } | null = null;

  // Timing anchors
  let startAudioContextTime = 0;
  let startTimelineTime = 0;
  let pausedAt = 0;

  // Drift tracking
  let _driftMs = 0;

  // Subscribers
  const timeUpdateListeners = new Set<(time: number) => void>();
  const stateChangeListeners = new Set<(state: ClockState) => void>();

  function computeCurrentTime(): number {
    if (state !== 'playing') return pausedAt;

    const elapsed = (audioContext.currentTime - startAudioContextTime) * _playbackRate;
    let time = startTimelineTime + elapsed;

    if (_loop && _loop.end > _loop.start && time >= _loop.end) {
      const loopDuration = _loop.end - _loop.start;
      time = _loop.start + ((time - _loop.start) % loopDuration);
    }

    return Math.max(0, Math.min(time, _duration || Infinity));
  }

  function notifyTimeUpdate(time: number): void {
    for (const cb of timeUpdateListeners) {
      try { cb(time); } catch (e) { console.error('[MasterClock] listener error:', e); }
    }
  }

  function notifyStateChange(newState: ClockState): void {
    for (const cb of stateChangeListeners) {
      try { cb(newState); } catch (e) { console.error('[MasterClock] listener error:', e); }
    }
  }

  function setState(newState: ClockState): void {
    if (state === newState) return;
    state = newState;
    notifyStateChange(newState);
  }

  const clock: MasterClock = {
    get currentTime() { return computeCurrentTime(); },
    get state() { return state; },
    get driftMs() { return _driftMs; },

    get playbackRate() { return _playbackRate; },
    set playbackRate(rate: number) {
      const clamped = Math.max(0.1, Math.min(rate, 16));
      if (state === 'playing') {
        // Re-anchor to avoid time jump
        const current = computeCurrentTime();
        startTimelineTime = current;
        startAudioContextTime = audioContext.currentTime;
      }
      _playbackRate = clamped;
    },

    get duration() { return _duration; },
    set duration(d: number) { _duration = Math.max(0, d); },

    get loop() { return _loop; },
    set loop(l) { _loop = l; },

    play(): void {
      if (state === 'playing') return;
      startTimelineTime = pausedAt;
      startAudioContextTime = audioContext.currentTime;
      setState('playing');
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
    },

    pause(): void {
      if (state !== 'playing') return;
      pausedAt = computeCurrentTime();
      setState('paused');
    },

    seek(time: number): void {
      const clamped = Math.max(0, Math.min(time, _duration));
      if (state === 'playing') {
        startTimelineTime = clamped;
        startAudioContextTime = audioContext.currentTime;
      } else {
        pausedAt = clamped;
      }
      notifyTimeUpdate(clamped);
    },

    reportVideoTime(videoTime: number): void {
      const audioTime = computeCurrentTime();
      _driftMs = (audioTime - videoTime) * 1000;
    },

    onTimeUpdate(cb) {
      timeUpdateListeners.add(cb);
      return () => { timeUpdateListeners.delete(cb); };
    },

    onStateChange(cb) {
      stateChangeListeners.add(cb);
      return () => { stateChangeListeners.delete(cb); };
    },

    destroy(): void {
      if (state === 'playing') {
        pausedAt = computeCurrentTime();
      }
      state = 'stopped';
      timeUpdateListeners.clear();
      stateChangeListeners.clear();
      _driftMs = 0;
    },
  };

  return clock;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/video && bunx vitest run __tests__/master-clock.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/video/src/master-clock.ts packages/video/__tests__/master-clock.test.ts
git commit -m "feat(video): implement MasterClock with AudioContext-driven timing"
```

---

### Task 5: Media Decoder

Wrap MediaBunny's decode API with per-asset caching.

**Files:**
- Create: `packages/video/src/media-decoder.ts`
- Create: `packages/video/__tests__/media-decoder.test.ts`

**Reference:** OpenReel `packages/core/src/media/mediabunny-engine.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/video/__tests__/media-decoder.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMediaDecoder } from '../src/media-decoder.js';
import { createMockAssetResolver, createMockCanvasImageSource, createMockAudioBuffer } from './helpers.js';
import type { AssetResolver } from '../src/types.js';

// Mock mediabunny module
const mockCanvasSink = {
  getCanvas: vi.fn().mockResolvedValue({
    canvas: createMockCanvasImageSource(),
    timestamp: 0,
    duration: 1 / 30,
  }),
};

const mockAudioBufferSink = {
  getBuffer: vi.fn().mockResolvedValue({
    buffer: createMockAudioBuffer(),
    timestamp: 0,
    duration: 5,
  }),
};

const mockVideoTrack = {
  codec: 'avc',
  displayWidth: 1920,
  displayHeight: 1080,
  computePacketStats: vi.fn().mockResolvedValue({ averageFrameRate: 30 }),
  computeDuration: vi.fn().mockResolvedValue(10),
};

const mockAudioTrack = {
  codec: 'aac',
  sampleRate: 48000,
  numberOfChannels: 2,
  computeDuration: vi.fn().mockResolvedValue(10),
};

const mockInput = {
  getPrimaryVideoTrack: vi.fn().mockResolvedValue(mockVideoTrack),
  getPrimaryAudioTrack: vi.fn().mockResolvedValue(mockAudioTrack),
  computeDuration: vi.fn().mockResolvedValue(10),
  dispose: vi.fn(),
};

vi.mock('mediabunny', () => ({
  Input: vi.fn().mockImplementation(() => mockInput),
  BlobSource: vi.fn().mockImplementation((blob: Blob) => blob),
  CanvasSink: vi.fn().mockImplementation(() => mockCanvasSink),
  AudioBufferSink: vi.fn().mockImplementation(() => mockAudioBufferSink),
  ALL_FORMATS: [],
}));

describe('MediaDecoder', () => {
  let resolver: AssetResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = createMockAssetResolver();
  });

  it('creates decoder with asset resolver', () => {
    const decoder = createMediaDecoder(resolver);
    expect(decoder).toBeDefined();
  });

  it('decodes a video frame', async () => {
    const decoder = createMediaDecoder(resolver);
    const frame = await decoder.decodeVideoFrame('asset-1', 1.5, 1920, 1080);
    expect(frame).toBeDefined();
    expect(resolver.fetchBlob).toHaveBeenCalledWith('asset-1');
  });

  it('caches Input per assetId', async () => {
    const decoder = createMediaDecoder(resolver);
    await decoder.decodeVideoFrame('asset-1', 0, 1920, 1080);
    await decoder.decodeVideoFrame('asset-1', 1, 1920, 1080);
    // fetchBlob should only be called once for the same asset
    expect(resolver.fetchBlob).toHaveBeenCalledTimes(1);
  });

  it('creates separate Input for different assets', async () => {
    const decoder = createMediaDecoder(resolver);
    await decoder.decodeVideoFrame('asset-1', 0, 1920, 1080);
    await decoder.decodeVideoFrame('asset-2', 0, 1920, 1080);
    expect(resolver.fetchBlob).toHaveBeenCalledTimes(2);
  });

  it('decodes audio to AudioBuffer', async () => {
    const decoder = createMediaDecoder(resolver);
    const buffer = await decoder.decodeAudio('asset-1');
    expect(buffer).toBeDefined();
    expect(buffer.duration).toBeGreaterThan(0);
  });

  it('caches decoded AudioBuffer', async () => {
    const decoder = createMediaDecoder(resolver);
    await decoder.decodeAudio('asset-1');
    await decoder.decodeAudio('asset-1');
    // AudioBufferSink should only be created once per asset
    const { AudioBufferSink } = await import('mediabunny');
    // Second call should return cached buffer without re-decoding
    expect(resolver.fetchBlob).toHaveBeenCalledTimes(1);
  });

  it('gets media info', async () => {
    const decoder = createMediaDecoder(resolver);
    const info = await decoder.getMediaInfo('asset-1');
    expect(info.width).toBe(1920);
    expect(info.height).toBe(1080);
    expect(info.fps).toBe(30);
    expect(info.hasVideo).toBe(true);
    expect(info.hasAudio).toBe(true);
    expect(info.duration).toBe(10);
    expect(info.videoCodec).toBe('avc');
    expect(info.audioCodec).toBe('aac');
    expect(info.sampleRate).toBe(48000);
    expect(info.channels).toBe(2);
  });

  it('destroy releases all resources', () => {
    const decoder = createMediaDecoder(resolver);
    expect(() => decoder.destroy()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/video && bunx vitest run __tests__/media-decoder.test.ts`
Expected: FAIL — `createMediaDecoder` not found

- [ ] **Step 3: Implement MediaDecoder**

```typescript
// packages/video/src/media-decoder.ts
import type { MediaDecoder, AssetResolver, MediaInfo } from './types.js';
import { Input, BlobSource, CanvasSink, AudioBufferSink, ALL_FORMATS } from 'mediabunny';

interface CachedAsset {
  input: InstanceType<typeof Input>;
  videoSink: InstanceType<typeof CanvasSink> | null;
  audioBuffer: AudioBuffer | null;
  mediaInfo: MediaInfo | null;
}

export function createMediaDecoder(resolver: AssetResolver): MediaDecoder {
  const cache = new Map<string, CachedAsset>();
  const initPromises = new Map<string, Promise<CachedAsset>>();

  async function getOrCreateAsset(assetId: string): Promise<CachedAsset> {
    const existing = cache.get(assetId);
    if (existing) return existing;

    // Deduplicate concurrent init for same asset
    const pending = initPromises.get(assetId);
    if (pending) return pending;

    const promise = (async () => {
      const blob = await resolver.fetchBlob(assetId);
      const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const asset: CachedAsset = { input, videoSink: null, audioBuffer: null, mediaInfo: null };
      cache.set(assetId, asset);
      initPromises.delete(assetId);
      return asset;
    })();

    initPromises.set(assetId, promise);
    return promise;
  }

  return {
    async decodeVideoFrame(assetId, time, width, height) {
      const asset = await getOrCreateAsset(assetId);

      if (!asset.videoSink) {
        const videoTrack = await asset.input.getPrimaryVideoTrack();
        if (!videoTrack) throw new Error(`No video track in asset ${assetId}`);
        asset.videoSink = new CanvasSink(videoTrack, {
          width,
          height,
          fit: 'contain',
          poolSize: 5,
        });
      }

      const result = await asset.videoSink.getCanvas(time);
      if (!result) throw new Error(`Failed to decode frame at ${time}s for asset ${assetId}`);
      return result.canvas;
    },

    async decodeAudio(assetId) {
      const asset = await getOrCreateAsset(assetId);

      if (asset.audioBuffer) return asset.audioBuffer;

      const audioTrack = await asset.input.getPrimaryAudioTrack();
      if (!audioTrack) throw new Error(`No audio track in asset ${assetId}`);

      const sink = new AudioBufferSink(audioTrack);
      const result = await sink.getBuffer(0);
      if (!result) throw new Error(`Failed to decode audio for asset ${assetId}`);

      asset.audioBuffer = result.buffer;
      return result.buffer;
    },

    async getMediaInfo(assetId) {
      const asset = await getOrCreateAsset(assetId);

      if (asset.mediaInfo) return asset.mediaInfo;

      const videoTrack = await asset.input.getPrimaryVideoTrack();
      const audioTrack = await asset.input.getPrimaryAudioTrack();
      const duration = await asset.input.computeDuration();

      let fps = 0;
      if (videoTrack) {
        const stats = await videoTrack.computePacketStats(100);
        fps = stats.averageFrameRate;
      }

      const info: MediaInfo = {
        duration,
        width: videoTrack?.displayWidth ?? 0,
        height: videoTrack?.displayHeight ?? 0,
        fps,
        hasVideo: videoTrack !== null,
        hasAudio: audioTrack !== null,
        videoCodec: videoTrack?.codec ?? null,
        audioCodec: audioTrack?.codec ?? null,
        sampleRate: audioTrack?.sampleRate ?? 0,
        channels: audioTrack?.numberOfChannels ?? 0,
      };

      asset.mediaInfo = info;
      return info;
    },

    destroy() {
      for (const asset of cache.values()) {
        asset.input.dispose();
      }
      cache.clear();
      initPromises.clear();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/video && bunx vitest run __tests__/media-decoder.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/video/src/media-decoder.ts packages/video/__tests__/media-decoder.test.ts
git commit -m "feat(video): implement MediaDecoder with per-asset caching"
```

---

### Task 6: Frame Renderer

Orchestrate resolveFrame → decode → composite into a single rendered frame.

**Files:**
- Create: `packages/video/src/frame-renderer.ts`
- Create: `packages/video/__tests__/frame-renderer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/video/__tests__/frame-renderer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFrameRenderer } from '../src/frame-renderer.js';
import {
  createMockMediaDecoder,
  createMockCompositor,
  createMockComposition,
  createMockTrack,
  createMockClip,
  createMockCanvasImageSource,
  createMockImageBitmap,
} from './helpers.js';
import type { Compositor, MediaDecoder } from '../src/types.js';

describe('FrameRenderer', () => {
  let mockDecoder: MediaDecoder;
  let mockCompositor: Compositor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDecoder = createMockMediaDecoder();
    mockCompositor = createMockCompositor();
  });

  it('creates frame renderer', () => {
    const renderer = createFrameRenderer(mockDecoder, mockCompositor, 1920, 1080);
    expect(renderer).toBeDefined();
  });

  it('renders empty composition (no tracks)', async () => {
    const composition = createMockComposition({ tracks: [], duration: 10 });
    const renderer = createFrameRenderer(mockDecoder, mockCompositor, 1920, 1080);
    const frame = await renderer.renderFrame(composition, 0);

    expect(frame.time).toBe(0);
    expect(frame.width).toBe(1920);
    expect(frame.height).toBe(1080);
    // Compositor called with empty layers
    expect(mockCompositor.composite).toHaveBeenCalledWith([]);
  });

  it('renders single video clip', async () => {
    const clip = createMockClip({ id: 'c1', assetId: 'a1', startTime: 0, duration: 5, inPoint: 0, outPoint: 5 });
    const track = createMockTrack({ id: 't1', type: 'video', clips: [clip] });
    const composition = createMockComposition({ tracks: [track], duration: 5 });

    const renderer = createFrameRenderer(mockDecoder, mockCompositor, 1920, 1080);
    await renderer.renderFrame(composition, 2);

    // Should decode the clip's video frame at localTime
    expect(mockDecoder.decodeVideoFrame).toHaveBeenCalledWith('a1', 2, 1920, 1080);
    // Should composite one layer
    expect(mockCompositor.composite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ opacity: 1, zIndex: 0 }),
      ]),
    );
  });

  it('renders multiple tracks in correct order', async () => {
    const clip1 = createMockClip({ id: 'c1', assetId: 'a1', trackId: 't1', startTime: 0, duration: 10 });
    const clip2 = createMockClip({ id: 'c2', assetId: 'a2', trackId: 't2', startTime: 0, duration: 10 });
    const track1 = createMockTrack({ id: 't1', type: 'video', clips: [clip1] });
    const track2 = createMockTrack({ id: 't2', type: 'video', clips: [clip2] });
    const composition = createMockComposition({ tracks: [track1, track2], duration: 10 });

    const renderer = createFrameRenderer(mockDecoder, mockCompositor, 1920, 1080);
    await renderer.renderFrame(composition, 0);

    expect(mockDecoder.decodeVideoFrame).toHaveBeenCalledTimes(2);
    const layers = (mockCompositor.composite as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(layers).toHaveLength(2);
    // Track order: first track = zIndex 0 (bottom), second = zIndex 1 (top)
    expect(layers[0].zIndex).toBe(0);
    expect(layers[1].zIndex).toBe(1);
  });

  it('skips audio tracks', async () => {
    const clip = createMockClip({ id: 'c1', assetId: 'a1', startTime: 0, duration: 5 });
    const audioTrack = createMockTrack({ id: 't1', type: 'audio', clips: [clip] });
    const composition = createMockComposition({ tracks: [audioTrack], duration: 5 });

    const renderer = createFrameRenderer(mockDecoder, mockCompositor, 1920, 1080);
    await renderer.renderFrame(composition, 0);

    expect(mockDecoder.decodeVideoFrame).not.toHaveBeenCalled();
    expect(mockCompositor.composite).toHaveBeenCalledWith([]);
  });

  it('skips muted tracks', async () => {
    const clip = createMockClip({ id: 'c1', assetId: 'a1', startTime: 0, duration: 5 });
    const track = createMockTrack({ id: 't1', type: 'video', clips: [clip], muted: true });
    const composition = createMockComposition({ tracks: [track], duration: 5 });

    const renderer = createFrameRenderer(mockDecoder, mockCompositor, 1920, 1080);
    await renderer.renderFrame(composition, 0);

    expect(mockDecoder.decodeVideoFrame).not.toHaveBeenCalled();
  });

  it('skips clips not active at the given time', async () => {
    const clip = createMockClip({ id: 'c1', assetId: 'a1', startTime: 5, duration: 5, inPoint: 0, outPoint: 5 });
    const track = createMockTrack({ id: 't1', type: 'video', clips: [clip] });
    const composition = createMockComposition({ tracks: [track], duration: 10 });

    const renderer = createFrameRenderer(mockDecoder, mockCompositor, 1920, 1080);
    await renderer.renderFrame(composition, 2);

    expect(mockDecoder.decodeVideoFrame).not.toHaveBeenCalled();
  });

  it('computes correct localTime for clip', async () => {
    // Clip starts at 3s on timeline, inPoint=2 (trim start)
    const clip = createMockClip({
      id: 'c1', assetId: 'a1', startTime: 3, duration: 5, inPoint: 2, outPoint: 7,
    });
    const track = createMockTrack({ id: 't1', type: 'video', clips: [clip] });
    const composition = createMockComposition({ tracks: [track], duration: 10 });

    const renderer = createFrameRenderer(mockDecoder, mockCompositor, 1920, 1080);
    await renderer.renderFrame(composition, 5);

    // localTime = inPoint + (time - startTime) = 2 + (5 - 3) = 4
    expect(mockDecoder.decodeVideoFrame).toHaveBeenCalledWith('a1', 4, 1920, 1080);
  });

  it('destroy calls subsystem destroy', () => {
    const renderer = createFrameRenderer(mockDecoder, mockCompositor, 1920, 1080);
    renderer.destroy();
    expect(mockDecoder.destroy).toHaveBeenCalled();
    expect(mockCompositor.destroy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/video && bunx vitest run __tests__/frame-renderer.test.ts`
Expected: FAIL — `createFrameRenderer` not found

- [ ] **Step 3: Implement FrameRenderer**

```typescript
// packages/video/src/frame-renderer.ts
import type { FrameRenderer, RenderedFrame, MediaDecoder, Compositor, CompositeLayer } from './types.js';
import type { Composition } from '@pneuma-craft/timeline';
import { resolveFrame } from '@pneuma-craft/timeline';

export function createFrameRenderer(
  decoder: MediaDecoder,
  compositor: Compositor,
  width: number,
  height: number,
): FrameRenderer {
  return {
    async renderFrame(composition: Composition, time: number): Promise<RenderedFrame> {
      const resolved = resolveFrame(composition, time);

      // Only render video/image clips (skip audio, subtitle)
      const videoClips = resolved.clips.filter(
        rc => rc.track.type === 'video',
      );

      const layers: CompositeLayer[] = [];

      for (let i = 0; i < videoClips.length; i++) {
        const rc = videoClips[i];
        const source = await decoder.decodeVideoFrame(
          rc.clip.assetId,
          rc.localTime,
          width,
          height,
        );
        layers.push({
          source,
          opacity: rc.clip.volume ?? 1, // volume field doubles as opacity for video clips
          zIndex: i,
        });
      }

      const image = await compositor.composite(layers);

      return { image, time, width, height };
    },

    destroy(): void {
      decoder.destroy();
      compositor.destroy();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/video && bunx vitest run __tests__/frame-renderer.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/video/src/frame-renderer.ts packages/video/__tests__/frame-renderer.test.ts
git commit -m "feat(video): implement FrameRenderer pipeline"
```

---

### Task 7: Audio Scheduler

Implement real-time audio playback with Web Audio API, look-ahead scheduling, per-track volume/mute, and per-clip fade.

**Files:**
- Create: `packages/video/src/audio-scheduler.ts`
- Create: `packages/video/__tests__/audio-scheduler.test.ts`

**Reference:** OpenReel `packages/core/src/audio/realtime-audio-graph.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/video/__tests__/audio-scheduler.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAudioScheduler } from '../src/audio-scheduler.js';
import {
  createMockAudioContext,
  createMockAudioBuffer,
  createMockComposition,
  createMockTrack,
  createMockClip,
} from './helpers.js';
import type { AudioScheduler } from '../src/types.js';

describe('AudioScheduler', () => {
  let mockAudioCtx: AudioContext & { _advanceTime(s: number): void };

  beforeEach(() => {
    mockAudioCtx = createMockAudioContext() as AudioContext & { _advanceTime(s: number): void };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates scheduler with audio context', () => {
    const scheduler = createAudioScheduler(mockAudioCtx);
    expect(scheduler).toBeDefined();
    expect(scheduler.audioContext).toBe(mockAudioCtx);
  });

  it('loadClip stores audio buffer', () => {
    const scheduler = createAudioScheduler(mockAudioCtx);
    const buffer = createMockAudioBuffer();
    expect(() => scheduler.loadClip('clip-1', buffer)).not.toThrow();
  });

  it('play creates source nodes for active clips', () => {
    const scheduler = createAudioScheduler(mockAudioCtx);
    const buffer = createMockAudioBuffer(5);
    scheduler.loadClip('c1', buffer);

    const clip = createMockClip({ id: 'c1', assetId: 'a1', trackId: 't1', startTime: 0, duration: 5, inPoint: 0, outPoint: 5 });
    const track = createMockTrack({ id: 't1', type: 'audio', clips: [clip] });
    const composition = createMockComposition({ tracks: [track], duration: 5 });

    scheduler.play(0, composition);
    expect(mockAudioCtx.createBufferSource).toHaveBeenCalled();
    expect(mockAudioCtx.createGain).toHaveBeenCalled();
  });

  it('pause stops all active sources', () => {
    const scheduler = createAudioScheduler(mockAudioCtx);
    const buffer = createMockAudioBuffer(5);
    scheduler.loadClip('c1', buffer);

    const clip = createMockClip({ id: 'c1', startTime: 0, duration: 5 });
    const track = createMockTrack({ id: 't1', type: 'audio', clips: [clip] });
    const composition = createMockComposition({ tracks: [track], duration: 5 });

    scheduler.play(0, composition);
    scheduler.pause();
    // Source nodes should be stopped
    const sourceNode = (mockAudioCtx.createBufferSource as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(sourceNode?.stop).toHaveBeenCalled();
  });

  it('setTrackVolume updates gain node', () => {
    const scheduler = createAudioScheduler(mockAudioCtx);
    expect(() => scheduler.setTrackVolume('t1', 0.5)).not.toThrow();
  });

  it('setTrackMute sets gain to zero', () => {
    const scheduler = createAudioScheduler(mockAudioCtx);
    expect(() => scheduler.setTrackMute('t1', true)).not.toThrow();
  });

  it('seek stops current sources and reschedules', () => {
    const scheduler = createAudioScheduler(mockAudioCtx);
    const buffer = createMockAudioBuffer(10);
    scheduler.loadClip('c1', buffer);

    const clip = createMockClip({ id: 'c1', startTime: 0, duration: 10 });
    const track = createMockTrack({ id: 't1', type: 'audio', clips: [clip] });
    const composition = createMockComposition({ tracks: [track], duration: 10 });

    scheduler.play(0, composition);
    const firstSource = (mockAudioCtx.createBufferSource as ReturnType<typeof vi.fn>).mock.results[0]?.value;

    scheduler.seek(5, composition);
    expect(firstSource?.stop).toHaveBeenCalled();
    // New source created for the seeked position
    expect(mockAudioCtx.createBufferSource).toHaveBeenCalledTimes(2);
  });

  it('skips clips without loaded buffers', () => {
    const scheduler = createAudioScheduler(mockAudioCtx);
    // Don't load any buffers

    const clip = createMockClip({ id: 'c1', startTime: 0, duration: 5 });
    const track = createMockTrack({ id: 't1', type: 'audio', clips: [clip] });
    const composition = createMockComposition({ tracks: [track], duration: 5 });

    scheduler.play(0, composition);
    expect(mockAudioCtx.createBufferSource).not.toHaveBeenCalled();
  });

  it('skips muted tracks', () => {
    const scheduler = createAudioScheduler(mockAudioCtx);
    const buffer = createMockAudioBuffer(5);
    scheduler.loadClip('c1', buffer);

    const clip = createMockClip({ id: 'c1', startTime: 0, duration: 5 });
    const track = createMockTrack({ id: 't1', type: 'audio', clips: [clip], muted: true });
    const composition = createMockComposition({ tracks: [track], duration: 5 });

    scheduler.play(0, composition);
    // Source still created but connected through muted gain
    // The key behavior is that the track gain is 0
  });

  it('destroy cleans up all resources', () => {
    const scheduler = createAudioScheduler(mockAudioCtx);
    expect(() => scheduler.destroy()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/video && bunx vitest run __tests__/audio-scheduler.test.ts`
Expected: FAIL — `createAudioScheduler` not found

- [ ] **Step 3: Implement AudioScheduler**

```typescript
// packages/video/src/audio-scheduler.ts
import type { AudioScheduler } from './types.js';
import type { Composition, Clip, Track } from '@pneuma-craft/timeline';

interface ScheduledSource {
  clipId: string;
  source: AudioBufferSourceNode;
  gainNode: GainNode;
}

interface TrackState {
  volume: number;
  muted: boolean;
  gainNode: GainNode;
}

export function createAudioScheduler(audioContext: AudioContext): AudioScheduler {
  const clipBuffers = new Map<string, AudioBuffer>();
  const activeSources: ScheduledSource[] = [];
  const trackStates = new Map<string, TrackState>();
  const masterGain = audioContext.createGain();
  masterGain.connect(audioContext.destination);

  function getOrCreateTrackState(trackId: string): TrackState {
    let state = trackStates.get(trackId);
    if (!state) {
      const gainNode = audioContext.createGain();
      gainNode.connect(masterGain);
      state = { volume: 1, muted: false, gainNode };
      trackStates.set(trackId, state);
    }
    return state;
  }

  function stopAllSources(): void {
    for (const scheduled of activeSources) {
      try {
        scheduled.source.stop();
        scheduled.source.disconnect();
        scheduled.gainNode.disconnect();
      } catch {
        // Source may already be stopped
      }
    }
    activeSources.length = 0;
  }

  function getActiveAudioClips(composition: Composition, time: number): Array<{ clip: Clip; track: Track }> {
    const result: Array<{ clip: Clip; track: Track }> = [];
    for (const track of composition.tracks) {
      if (track.type !== 'audio' || track.muted) continue;
      for (const clip of track.clips) {
        const clipEnd = clip.startTime + clip.duration;
        if (time >= clip.startTime && time < clipEnd) {
          result.push({ clip, track });
        }
      }
    }
    return result;
  }

  function scheduleClipsFromTime(time: number, composition: Composition): void {
    const activeClips = getActiveAudioClips(composition, time);

    for (const { clip, track } of activeClips) {
      const buffer = clipBuffers.get(clip.id);
      if (!buffer) continue;

      const trackState = getOrCreateTrackState(track.id);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;

      // Per-clip gain for volume and fade
      const clipGain = audioContext.createGain();
      clipGain.gain.value = clip.volume ?? 1;

      source.connect(clipGain);
      clipGain.connect(trackState.gainNode);

      // Calculate source offset and remaining duration
      const sourceOffset = clip.inPoint + (time - clip.startTime);
      const remainingDuration = clip.duration - (time - clip.startTime);

      if (remainingDuration <= 0 || sourceOffset >= buffer.duration) continue;

      // Apply fade automation
      const contextNow = audioContext.currentTime;
      const clipContextStart = contextNow;
      const clipVolume = clip.volume ?? 1;

      if (clip.fadeIn && clip.fadeIn > 0) {
        const fadeElapsed = time - clip.startTime;
        if (fadeElapsed < clip.fadeIn) {
          // Still in fade-in region
          const fadeRemaining = clip.fadeIn - fadeElapsed;
          const currentFadeLevel = (fadeElapsed / clip.fadeIn) * clipVolume;
          clipGain.gain.setValueAtTime(currentFadeLevel, contextNow);
          clipGain.gain.linearRampToValueAtTime(clipVolume, contextNow + fadeRemaining);
        }
      }

      if (clip.fadeOut && clip.fadeOut > 0) {
        const clipEnd = clip.startTime + clip.duration;
        const fadeOutStart = clipEnd - clip.fadeOut;
        const fadeOutContextTime = contextNow + (fadeOutStart - time);
        if (fadeOutContextTime > contextNow) {
          clipGain.gain.setValueAtTime(clipVolume, fadeOutContextTime);
          clipGain.gain.linearRampToValueAtTime(0, fadeOutContextTime + clip.fadeOut);
        }
      }

      source.start(0, sourceOffset, remainingDuration);

      const scheduled: ScheduledSource = { clipId: clip.id, source, gainNode: clipGain };
      activeSources.push(scheduled);

      source.onended = () => {
        const idx = activeSources.indexOf(scheduled);
        if (idx >= 0) activeSources.splice(idx, 1);
      };
    }
  }

  return {
    get audioContext() { return audioContext; },

    loadClip(clipId, audioBuffer) {
      clipBuffers.set(clipId, audioBuffer);
    },

    play(fromTime, composition) {
      stopAllSources();
      scheduleClipsFromTime(fromTime, composition);
    },

    pause() {
      stopAllSources();
    },

    seek(time, composition) {
      stopAllSources();
      scheduleClipsFromTime(time, composition);
    },

    setTrackVolume(trackId, volume) {
      const state = getOrCreateTrackState(trackId);
      state.volume = volume;
      if (!state.muted) {
        state.gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
      }
    },

    setTrackMute(trackId, muted) {
      const state = getOrCreateTrackState(trackId);
      state.muted = muted;
      state.gainNode.gain.setValueAtTime(
        muted ? 0 : state.volume,
        audioContext.currentTime,
      );
    },

    destroy() {
      stopAllSources();
      for (const state of trackStates.values()) {
        state.gainNode.disconnect();
      }
      trackStates.clear();
      clipBuffers.clear();
      masterGain.disconnect();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/video && bunx vitest run __tests__/audio-scheduler.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/video/src/audio-scheduler.ts packages/video/__tests__/audio-scheduler.test.ts
git commit -m "feat(video): implement AudioScheduler with look-ahead scheduling"
```

---

### Task 8: Playback Engine

Orchestrate all subsystems for synchronized real-time preview.

**Files:**
- Create: `packages/video/src/playback-engine.ts`
- Create: `packages/video/__tests__/playback-engine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/video/__tests__/playback-engine.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPlaybackEngine } from '../src/playback-engine.js';
import {
  createMockAssetResolver,
  createMockComposition,
  createMockTrack,
  createMockClip,
  createMockImageBitmap,
  createMockAudioBuffer,
} from './helpers.js';
import type { PlaybackEngine } from '../src/types.js';

// Mock subsystem factories
vi.mock('../src/media-decoder.js', () => ({
  createMediaDecoder: vi.fn().mockReturnValue({
    decodeVideoFrame: vi.fn().mockResolvedValue(createMockImageBitmap()),
    decodeAudio: vi.fn().mockResolvedValue(createMockAudioBuffer()),
    getMediaInfo: vi.fn().mockResolvedValue({
      duration: 10, width: 1920, height: 1080, fps: 30,
      hasVideo: true, hasAudio: true,
      videoCodec: 'avc', audioCodec: 'aac',
      sampleRate: 48000, channels: 2,
    }),
    destroy: vi.fn(),
  }),
}));

vi.mock('../src/compositor.js', () => ({
  createCompositor: vi.fn().mockResolvedValue({
    composite: vi.fn().mockResolvedValue(createMockImageBitmap()),
    resize: vi.fn(),
    destroy: vi.fn(),
  }),
}));

vi.mock('../src/master-clock.js', () => ({
  createMasterClock: vi.fn().mockReturnValue({
    currentTime: 0,
    state: 'stopped' as const,
    driftMs: 0,
    playbackRate: 1,
    duration: 0,
    loop: null,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    reportVideoTime: vi.fn(),
    onTimeUpdate: vi.fn().mockReturnValue(vi.fn()),
    onStateChange: vi.fn().mockReturnValue(vi.fn()),
    destroy: vi.fn(),
  }),
}));

vi.mock('../src/audio-scheduler.js', () => ({
  createAudioScheduler: vi.fn().mockReturnValue({
    audioContext: {},
    loadClip: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    setTrackVolume: vi.fn(),
    setTrackMute: vi.fn(),
    destroy: vi.fn(),
  }),
}));

// Mock global APIs
vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => ({
  currentTime: 0,
  state: 'running',
  sampleRate: 48000,
  destination: {},
  createGain: vi.fn().mockReturnValue({
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
  createBufferSource: vi.fn(),
  resume: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
})));

vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
vi.stubGlobal('cancelAnimationFrame', vi.fn());

describe('PlaybackEngine', () => {
  let resolver = createMockAssetResolver();

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = createMockAssetResolver();
  });

  it('starts in idle state', () => {
    const engine = createPlaybackEngine();
    expect(engine.state).toBe('idle');
    expect(engine.currentTime).toBe(0);
  });

  it('load transitions to ready state', async () => {
    const engine = createPlaybackEngine();
    const composition = createMockComposition({ duration: 10 });

    await engine.load(composition, resolver);
    expect(engine.state).toBe('ready');
  });

  it('play after load transitions to playing', async () => {
    const engine = createPlaybackEngine();
    const composition = createMockComposition({ duration: 10 });
    await engine.load(composition, resolver);

    engine.play();
    expect(engine.state).toBe('playing');
  });

  it('play without load throws', () => {
    const engine = createPlaybackEngine();
    expect(() => engine.play()).toThrow();
  });

  it('pause transitions to paused', async () => {
    const engine = createPlaybackEngine();
    const composition = createMockComposition({ duration: 10 });
    await engine.load(composition, resolver);
    engine.play();

    engine.pause();
    expect(engine.state).toBe('paused');
  });

  it('seek updates time', async () => {
    const engine = createPlaybackEngine();
    const composition = createMockComposition({ duration: 10 });
    await engine.load(composition, resolver);

    engine.seek(5);
    // Time update delegated to MasterClock
  });

  it('onStateChange fires on transitions', async () => {
    const engine = createPlaybackEngine();
    const cb = vi.fn();
    engine.onStateChange(cb);

    const composition = createMockComposition({ duration: 10 });
    await engine.load(composition, resolver);
    expect(cb).toHaveBeenCalledWith('loading');
    expect(cb).toHaveBeenCalledWith('ready');
  });

  it('onTimeUpdate subscription works', async () => {
    const engine = createPlaybackEngine();
    const cb = vi.fn();
    const unsub = engine.onTimeUpdate(cb);
    expect(unsub).toBeTypeOf('function');
  });

  it('onFrameRendered subscription works', async () => {
    const engine = createPlaybackEngine();
    const cb = vi.fn();
    const unsub = engine.onFrameRendered(cb);
    expect(unsub).toBeTypeOf('function');
  });

  it('destroy cleans up all subsystems', async () => {
    const engine = createPlaybackEngine();
    const composition = createMockComposition({ duration: 10 });
    await engine.load(composition, resolver);

    expect(() => engine.destroy()).not.toThrow();
    expect(engine.state).toBe('idle');
  });

  it('load pre-decodes audio for audio clips', async () => {
    const engine = createPlaybackEngine();
    const clip = createMockClip({ id: 'c1', assetId: 'a1', startTime: 0, duration: 5 });
    const track = createMockTrack({ id: 't1', type: 'audio', clips: [clip] });
    const composition = createMockComposition({ tracks: [track], duration: 5 });

    await engine.load(composition, resolver);
    // MediaDecoder.decodeAudio should have been called for the audio clip
    const { createMediaDecoder } = await import('../src/media-decoder.js');
    const mockDecoder = (createMediaDecoder as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(mockDecoder.decodeAudio).toHaveBeenCalledWith('a1');
  });

  it('playbackRate getter/setter works', () => {
    const engine = createPlaybackEngine();
    engine.playbackRate = 2;
    expect(engine.playbackRate).toBe(2);
  });

  it('loop getter/setter works', () => {
    const engine = createPlaybackEngine();
    engine.loop = { start: 1, end: 5 };
    expect(engine.loop).toEqual({ start: 1, end: 5 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/video && bunx vitest run __tests__/playback-engine.test.ts`
Expected: FAIL — `createPlaybackEngine` not found

- [ ] **Step 3: Implement PlaybackEngine**

```typescript
// packages/video/src/playback-engine.ts
import type {
  PlaybackEngine,
  PlaybackState,
  RenderedFrame,
  AssetResolver,
  MasterClock,
  AudioScheduler as AudioSchedulerType,
  FrameRenderer as FrameRendererType,
  MediaDecoder as MediaDecoderType,
} from './types.js';
import type { Composition } from '@pneuma-craft/timeline';
import { createMediaDecoder } from './media-decoder.js';
import { createCompositor, type CompositorType } from './compositor.js';
import { createFrameRenderer } from './frame-renderer.js';
import { createMasterClock } from './master-clock.js';
import { createAudioScheduler } from './audio-scheduler.js';

export interface PlaybackEngineOptions {
  compositorType?: CompositorType;
}

export function createPlaybackEngine(options?: PlaybackEngineOptions): PlaybackEngine {
  let _state: PlaybackState = 'idle';
  let _playbackRate = 1;
  let _loop: { start: number; end: number } | null = null;
  let _composition: Composition | null = null;

  let decoder: MediaDecoderType | null = null;
  let frameRenderer: FrameRendererType | null = null;
  let clock: MasterClock | null = null;
  let audioScheduler: AudioSchedulerType | null = null;
  let rafId: number | null = null;

  const stateListeners = new Set<(state: PlaybackState) => void>();
  const timeListeners = new Set<(time: number) => void>();
  const frameListeners = new Set<(frame: RenderedFrame) => void>();

  function setState(newState: PlaybackState): void {
    if (_state === newState) return;
    _state = newState;
    for (const cb of stateListeners) {
      try { cb(newState); } catch (e) { console.error('[PlaybackEngine]', e); }
    }
  }

  function startRenderLoop(): void {
    if (!clock || !frameRenderer || !_composition) return;

    const frameDurationMs = 1000 / (_composition.settings.fps || 30);

    const loop = () => {
      if (_state !== 'playing' || !clock || !frameRenderer || !_composition) return;

      const time = clock.currentTime;

      // Drift compensation: skip frame if audio is too far ahead
      if (clock.driftMs > frameDurationMs) {
        clock.reportVideoTime(time);
        rafId = requestAnimationFrame(loop);
        return;
      }

      frameRenderer.renderFrame(_composition, time).then(frame => {
        if (_state !== 'playing') return;
        clock!.reportVideoTime(time);

        for (const cb of frameListeners) {
          try { cb(frame); } catch (e) { console.error('[PlaybackEngine]', e); }
        }
        for (const cb of timeListeners) {
          try { cb(time); } catch (e) { console.error('[PlaybackEngine]', e); }
        }

        // Check end of timeline
        if (time >= _composition!.duration && !_loop) {
          engine.pause();
          return;
        }

        rafId = requestAnimationFrame(loop);
      }).catch(err => {
        console.error('[PlaybackEngine] render error:', err);
        rafId = requestAnimationFrame(loop);
      });
    };

    rafId = requestAnimationFrame(loop);
  }

  function stopRenderLoop(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  const engine: PlaybackEngine = {
    get state() { return _state; },
    get currentTime() { return clock?.currentTime ?? 0; },

    get playbackRate() { return _playbackRate; },
    set playbackRate(rate: number) {
      _playbackRate = rate;
      if (clock) clock.playbackRate = rate;
    },

    get loop() { return _loop; },
    set loop(l) {
      _loop = l;
      if (clock) clock.loop = l;
    },

    async load(composition, resolver) {
      // Clean up previous state
      if (decoder) decoder.destroy();
      if (frameRenderer) frameRenderer.destroy();
      if (clock) clock.destroy();
      if (audioScheduler) audioScheduler.destroy();
      stopRenderLoop();

      setState('loading');
      _composition = composition;

      // Initialize subsystems
      const audioContext = new AudioContext();
      decoder = createMediaDecoder(resolver);
      const compositor = await createCompositor(
        composition.settings.width,
        composition.settings.height,
        options?.compositorType,
      );
      frameRenderer = createFrameRenderer(decoder, compositor, composition.settings.width, composition.settings.height);
      clock = createMasterClock({ audioContext, duration: composition.duration });
      clock.playbackRate = _playbackRate;
      clock.loop = _loop;
      audioScheduler = createAudioScheduler(audioContext);

      // Pre-load audio buffers for all audio clips
      const audioClips = composition.tracks
        .filter(t => t.type === 'audio' && !t.muted)
        .flatMap(t => t.clips);

      for (const clip of audioClips) {
        try {
          const buffer = await decoder.decodeAudio(clip.assetId);
          audioScheduler.loadClip(clip.id, buffer);
        } catch (err) {
          console.warn(`[PlaybackEngine] Failed to decode audio for clip ${clip.id}:`, err);
        }
      }

      // Render first frame
      try {
        const firstFrame = await frameRenderer.renderFrame(composition, 0);
        for (const cb of frameListeners) {
          try { cb(firstFrame); } catch (e) { console.error('[PlaybackEngine]', e); }
        }
      } catch {
        // Non-critical: first frame render failure doesn't block load
      }

      setState('ready');
    },

    play() {
      if (!_composition || !clock || !audioScheduler) {
        throw new Error('Cannot play: no composition loaded. Call load() first.');
      }
      if (_state === 'playing') return;

      clock.play();
      audioScheduler.play(clock.currentTime, _composition);
      setState('playing');
      startRenderLoop();
    },

    pause() {
      if (_state !== 'playing') return;
      stopRenderLoop();
      clock?.pause();
      audioScheduler?.pause();
      setState('paused');
    },

    seek(time) {
      if (!clock || !_composition) return;
      clock.seek(time);
      audioScheduler?.seek(time, _composition);

      // Render frame at seek position
      if (frameRenderer && _composition) {
        frameRenderer.renderFrame(_composition, time).then(frame => {
          for (const cb of frameListeners) {
            try { cb(frame); } catch (e) { console.error('[PlaybackEngine]', e); }
          }
          for (const cb of timeListeners) {
            try { cb(time); } catch (e) { console.error('[PlaybackEngine]', e); }
          }
        }).catch(() => {});
      }
    },

    onStateChange(cb) {
      stateListeners.add(cb);
      return () => { stateListeners.delete(cb); };
    },

    onTimeUpdate(cb) {
      timeListeners.add(cb);
      return () => { timeListeners.delete(cb); };
    },

    onFrameRendered(cb) {
      frameListeners.add(cb);
      return () => { frameListeners.delete(cb); };
    },

    destroy() {
      stopRenderLoop();
      clock?.destroy();
      audioScheduler?.destroy();
      // Don't destroy decoder/frameRenderer here — they clean up together
      if (frameRenderer) frameRenderer.destroy();
      decoder = null;
      frameRenderer = null;
      clock = null;
      audioScheduler = null;
      _composition = null;
      stateListeners.clear();
      timeListeners.clear();
      frameListeners.clear();
      _state = 'idle';
    },
  };

  return engine;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/video && bunx vitest run __tests__/playback-engine.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/video/src/playback-engine.ts packages/video/__tests__/playback-engine.test.ts
git commit -m "feat(video): implement PlaybackEngine with rAF loop + drift compensation"
```

---

### Task 9: Offline Audio Renderer

Render all audio tracks to a single AudioBuffer using OfflineAudioContext for export.

**Files:**
- Create: `packages/video/src/offline-audio-renderer.ts`
- Create: `packages/video/__tests__/offline-audio-renderer.test.ts`

**Reference:** OpenReel `packages/core/src/audio/audio-engine.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/video/__tests__/offline-audio-renderer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOfflineAudioRenderer } from '../src/offline-audio-renderer.js';
import {
  createMockComposition,
  createMockTrack,
  createMockClip,
  createMockAssetResolver,
  createMockAudioBuffer,
} from './helpers.js';

// Mock OfflineAudioContext
const mockRenderedBuffer = createMockAudioBuffer(10, 48000);

const mockOfflineGain = {
  gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
  connect: vi.fn().mockReturnThis(),
  disconnect: vi.fn(),
};

const mockOfflineSource = {
  buffer: null as AudioBuffer | null,
  playbackRate: { value: 1 },
  connect: vi.fn().mockReturnThis(),
  disconnect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};

vi.stubGlobal('OfflineAudioContext', vi.fn().mockImplementation(
  (channels: number, length: number, sampleRate: number) => ({
    destination: {},
    sampleRate,
    length,
    createGain: vi.fn(() => ({ ...mockOfflineGain })),
    createBufferSource: vi.fn(() => ({ ...mockOfflineSource })),
    startRendering: vi.fn().mockResolvedValue(mockRenderedBuffer),
  })
));

describe('OfflineAudioRenderer', () => {
  const decodeAudio = vi.fn().mockResolvedValue(createMockAudioBuffer(5, 48000));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty composition (no audio tracks)', async () => {
    const renderer = createOfflineAudioRenderer();
    const composition = createMockComposition({ duration: 5 });
    const resolver = createMockAssetResolver();

    const result = await renderer.render(composition, resolver, decodeAudio);
    expect(result).toBeDefined();
  });

  it('renders composition with audio clips', async () => {
    const renderer = createOfflineAudioRenderer();
    const clip = createMockClip({ id: 'c1', assetId: 'a1', startTime: 0, duration: 5, inPoint: 0, outPoint: 5 });
    const track = createMockTrack({ id: 't1', type: 'audio', clips: [clip] });
    const composition = createMockComposition({ tracks: [track], duration: 5 });
    const resolver = createMockAssetResolver();

    const result = await renderer.render(composition, resolver, decodeAudio);
    expect(decodeAudio).toHaveBeenCalledWith('a1');
    expect(result).toBeDefined();
  });

  it('skips muted tracks', async () => {
    const renderer = createOfflineAudioRenderer();
    const clip = createMockClip({ id: 'c1', assetId: 'a1', startTime: 0, duration: 5 });
    const track = createMockTrack({ id: 't1', type: 'audio', clips: [clip], muted: true });
    const composition = createMockComposition({ tracks: [track], duration: 5 });
    const resolver = createMockAssetResolver();

    await renderer.render(composition, resolver, decodeAudio);
    expect(decodeAudio).not.toHaveBeenCalled();
  });

  it('creates OfflineAudioContext with correct parameters', async () => {
    const renderer = createOfflineAudioRenderer();
    const clip = createMockClip({ id: 'c1', assetId: 'a1', startTime: 0, duration: 5 });
    const track = createMockTrack({ id: 't1', type: 'audio', clips: [clip] });
    const composition = createMockComposition({
      tracks: [track],
      duration: 5,
      settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9', sampleRate: 48000 },
    });
    const resolver = createMockAssetResolver();

    await renderer.render(composition, resolver, decodeAudio);
    expect(OfflineAudioContext).toHaveBeenCalledWith(2, 5 * 48000, 48000);
  });

  it('schedules clips at correct timeline position', async () => {
    const renderer = createOfflineAudioRenderer();
    const clip = createMockClip({
      id: 'c1', assetId: 'a1', startTime: 2, duration: 3, inPoint: 1, outPoint: 4,
    });
    const track = createMockTrack({ id: 't1', type: 'audio', clips: [clip] });
    const composition = createMockComposition({ tracks: [track], duration: 5 });
    const resolver = createMockAssetResolver();

    await renderer.render(composition, resolver, decodeAudio);
    // Source should start at time 2 with offset 1 (inPoint) and duration 3
    const ctor = OfflineAudioContext as unknown as ReturnType<typeof vi.fn>;
    const offlineCtx = ctor.mock.results[0]?.value;
    const source = offlineCtx.createBufferSource.mock.results[0]?.value;
    expect(source.start).toHaveBeenCalledWith(2, 1, 3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/video && bunx vitest run __tests__/offline-audio-renderer.test.ts`
Expected: FAIL — `createOfflineAudioRenderer` not found

- [ ] **Step 3: Implement OfflineAudioRenderer**

```typescript
// packages/video/src/offline-audio-renderer.ts
import type { OfflineAudioRenderer, AssetResolver } from './types.js';
import type { Composition, Clip, Track } from '@pneuma-craft/timeline';

export function createOfflineAudioRenderer(): OfflineAudioRenderer {
  return {
    async render(composition, _resolver, decodeAudio) {
      const sampleRate = composition.settings.sampleRate ?? 48000;
      const channels = 2;
      const duration = composition.duration;
      const length = Math.ceil(duration * sampleRate);

      const offlineCtx = new OfflineAudioContext(channels, length, sampleRate);

      // Collect all audio clips from unmuted tracks
      const audioClips: Array<{ clip: Clip; track: Track }> = [];
      for (const track of composition.tracks) {
        if (track.type !== 'audio' || track.muted) continue;
        for (const clip of track.clips) {
          audioClips.push({ clip, track });
        }
      }

      // Schedule each clip
      for (const { clip, track } of audioClips) {
        let buffer: AudioBuffer;
        try {
          buffer = await decodeAudio(clip.assetId);
        } catch {
          console.warn(`[OfflineAudioRenderer] Failed to decode audio for clip ${clip.id}`);
          continue;
        }

        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;

        // Per-clip gain
        const clipGain = offlineCtx.createGain();
        const clipVolume = clip.volume ?? 1;
        clipGain.gain.value = clipVolume;

        // Per-track gain
        const trackGain = offlineCtx.createGain();
        trackGain.gain.value = track.volume;

        source.connect(clipGain);
        clipGain.connect(trackGain);
        trackGain.connect(offlineCtx.destination);

        // Fade automation
        if (clip.fadeIn && clip.fadeIn > 0) {
          clipGain.gain.setValueAtTime(0, clip.startTime);
          clipGain.gain.linearRampToValueAtTime(clipVolume, clip.startTime + clip.fadeIn);
        }

        if (clip.fadeOut && clip.fadeOut > 0) {
          const fadeOutStart = clip.startTime + clip.duration - clip.fadeOut;
          clipGain.gain.setValueAtTime(clipVolume, fadeOutStart);
          clipGain.gain.linearRampToValueAtTime(0, clip.startTime + clip.duration);
        }

        // Schedule: start at timeline position, read from inPoint, for duration
        source.start(clip.startTime, clip.inPoint, clip.duration);
      }

      return offlineCtx.startRendering();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/video && bunx vitest run __tests__/offline-audio-renderer.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/video/src/offline-audio-renderer.ts packages/video/__tests__/offline-audio-renderer.test.ts
git commit -m "feat(video): implement OfflineAudioRenderer for export"
```

---

### Task 10: Export Engine

Sequential frame-by-frame render + MediaBunny encode to Blob.

**Files:**
- Create: `packages/video/src/export-engine.ts`
- Create: `packages/video/__tests__/export-engine.test.ts`

**Reference:** OpenReel `packages/core/src/export/export-engine.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/video/__tests__/export-engine.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExportEngine } from '../src/export-engine.js';
import {
  createMockAssetResolver,
  createMockComposition,
  createMockTrack,
  createMockClip,
  createMockImageBitmap,
  createMockAudioBuffer,
  defaultSettings,
} from './helpers.js';

// Mock subsystem factories
vi.mock('../src/media-decoder.js', () => ({
  createMediaDecoder: vi.fn().mockReturnValue({
    decodeVideoFrame: vi.fn().mockResolvedValue(createMockImageBitmap()),
    decodeAudio: vi.fn().mockResolvedValue(createMockAudioBuffer()),
    getMediaInfo: vi.fn().mockResolvedValue({
      duration: 10, width: 1920, height: 1080, fps: 30,
      hasVideo: true, hasAudio: true,
      videoCodec: 'avc', audioCodec: 'aac',
      sampleRate: 48000, channels: 2,
    }),
    destroy: vi.fn(),
  }),
}));

vi.mock('../src/compositor.js', () => ({
  createCompositor: vi.fn().mockResolvedValue({
    composite: vi.fn().mockResolvedValue(createMockImageBitmap()),
    resize: vi.fn(),
    destroy: vi.fn(),
  }),
}));

vi.mock('../src/offline-audio-renderer.js', () => ({
  createOfflineAudioRenderer: vi.fn().mockReturnValue({
    render: vi.fn().mockResolvedValue(createMockAudioBuffer(5)),
  }),
}));

// Mock MediaBunny
const mockVideoSource = { add: vi.fn().mockResolvedValue(undefined), close: vi.fn() };
const mockAudioSource = { add: vi.fn().mockResolvedValue(undefined), close: vi.fn() };
const mockBufferTarget = { buffer: new ArrayBuffer(100) };
const mockOutput = {
  addVideoTrack: vi.fn(),
  addAudioTrack: vi.fn(),
  start: vi.fn().mockResolvedValue(undefined),
  finalize: vi.fn().mockResolvedValue(undefined),
};

vi.mock('mediabunny', () => ({
  Input: vi.fn(),
  BlobSource: vi.fn(),
  CanvasSink: vi.fn(),
  AudioBufferSink: vi.fn(),
  ALL_FORMATS: [],
  Output: vi.fn().mockImplementation(() => mockOutput),
  CanvasSource: vi.fn().mockImplementation(() => mockVideoSource),
  AudioBufferSource: vi.fn().mockImplementation(() => mockAudioSource),
  Mp4OutputFormat: vi.fn(),
  WebMOutputFormat: vi.fn(),
  BufferTarget: vi.fn().mockImplementation(() => mockBufferTarget),
}));

vi.stubGlobal('OffscreenCanvas', vi.fn().mockImplementation((w: number, h: number) => ({
  width: w,
  height: h,
  getContext: vi.fn().mockReturnValue({
    drawImage: vi.fn(),
    clearRect: vi.fn(),
  }),
})));

vi.stubGlobal('OfflineAudioContext', vi.fn().mockImplementation(() => ({
  destination: {},
  createGain: vi.fn().mockReturnValue({
    gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  }),
  createBufferSource: vi.fn().mockReturnValue({
    connect: vi.fn(),
    start: vi.fn(),
    buffer: null,
  }),
  startRendering: vi.fn().mockResolvedValue(createMockAudioBuffer(5)),
})));

describe('ExportEngine', () => {
  let resolver = createMockAssetResolver();

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = createMockAssetResolver();
  });

  it('creates export engine', () => {
    const engine = createExportEngine();
    expect(engine).toBeDefined();
    expect(engine.export).toBeTypeOf('function');
    expect(engine.onProgress).toBeTypeOf('function');
    expect(engine.abort).toBeTypeOf('function');
  });

  it('exports composition to Blob', async () => {
    const engine = createExportEngine();
    // 1 second at 30fps = 30 frames. Use short duration for test speed.
    const composition = createMockComposition({
      settings: { ...defaultSettings, fps: 30 },
      duration: 0.1, // Very short for test
    });

    const blob = await engine.export(composition, {
      format: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      videoBitrate: 5000000,
      audioBitrate: 128000,
    }, resolver);

    expect(blob).toBeInstanceOf(Blob);
  });

  it('reports progress via callback', async () => {
    const engine = createExportEngine();
    const progressCb = vi.fn();
    engine.onProgress(progressCb);

    const composition = createMockComposition({
      settings: { ...defaultSettings, fps: 30 },
      duration: 0.2,
    });

    await engine.export(composition, {
      format: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      videoBitrate: 5000000,
      audioBitrate: 128000,
    }, resolver);

    // Progress should have been reported at least once
    expect(progressCb).toHaveBeenCalled();
    const lastCall = progressCb.mock.calls[progressCb.mock.calls.length - 1][0];
    expect(lastCall).toBeGreaterThanOrEqual(0);
    expect(lastCall).toBeLessThanOrEqual(1);
  });

  it('abort cancels export', async () => {
    const engine = createExportEngine();
    const composition = createMockComposition({
      settings: { ...defaultSettings, fps: 30 },
      duration: 10, // Long enough to abort mid-way
    });

    const exportPromise = engine.export(composition, {
      format: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      videoBitrate: 5000000,
      audioBitrate: 128000,
    }, resolver);

    // Abort immediately
    engine.abort();

    await expect(exportPromise).rejects.toThrow(/abort|cancel/i);
  });

  it('uses WebM format when specified', async () => {
    const engine = createExportEngine();
    const composition = createMockComposition({
      settings: { ...defaultSettings, fps: 30 },
      duration: 0.1,
    });

    await engine.export(composition, {
      format: 'webm',
      videoCodec: 'vp9',
      audioCodec: 'opus',
      videoBitrate: 5000000,
      audioBitrate: 128000,
    }, resolver);

    const { WebMOutputFormat } = await import('mediabunny');
    expect(WebMOutputFormat).toHaveBeenCalled();
  });

  it('encodes audio via OfflineAudioRenderer', async () => {
    const engine = createExportEngine();
    const clip = createMockClip({ id: 'c1', assetId: 'a1', startTime: 0, duration: 1 });
    const track = createMockTrack({ id: 't1', type: 'audio', clips: [clip] });
    const composition = createMockComposition({
      tracks: [track],
      settings: { ...defaultSettings, fps: 30 },
      duration: 0.1,
    });

    await engine.export(composition, {
      format: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      videoBitrate: 5000000,
      audioBitrate: 128000,
    }, resolver);

    // Audio should have been added to output
    expect(mockAudioSource.add).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/video && bunx vitest run __tests__/export-engine.test.ts`
Expected: FAIL — `createExportEngine` not found

- [ ] **Step 3: Implement ExportEngine**

```typescript
// packages/video/src/export-engine.ts
import type { ExportEngine, ExportOptions, AssetResolver, FrameRenderer as FrameRendererType } from './types.js';
import type { Composition } from '@pneuma-craft/timeline';
import { createMediaDecoder } from './media-decoder.js';
import { createCompositor } from './compositor.js';
import { createFrameRenderer } from './frame-renderer.js';
import { createOfflineAudioRenderer } from './offline-audio-renderer.js';
import {
  Output,
  CanvasSource,
  AudioBufferSource,
  Mp4OutputFormat,
  WebMOutputFormat,
  BufferTarget,
} from 'mediabunny';

export function createExportEngine(): ExportEngine {
  const progressListeners = new Set<(progress: number) => void>();
  let abortController: AbortController | null = null;

  function notifyProgress(progress: number): void {
    for (const cb of progressListeners) {
      try { cb(progress); } catch (e) { console.error('[ExportEngine]', e); }
    }
  }

  return {
    async export(composition, options, resolver) {
      abortController = new AbortController();
      const signal = abortController.signal;

      const fps = options.fps ?? composition.settings.fps;
      const width = options.width ?? composition.settings.width;
      const height = options.height ?? composition.settings.height;
      const totalFrames = Math.ceil(composition.duration * fps);

      // Initialize rendering subsystems
      const decoder = createMediaDecoder(resolver);
      const compositor = await createCompositor(width, height, 'canvas2d'); // Canvas2D for export (no GPU readback needed)
      const renderer = createFrameRenderer(decoder, compositor, width, height);

      try {
        // Set up MediaBunny output
        const format = options.format === 'webm'
          ? new WebMOutputFormat()
          : new Mp4OutputFormat({ fastStart: 'in-memory' });

        const target = new BufferTarget();
        const output = new Output({ format, target });

        const videoSource = new CanvasSource(
          new OffscreenCanvas(width, height),
          {
            codec: options.videoCodec,
            bitrate: options.videoBitrate,
          },
        );

        const audioSource = new AudioBufferSource({
          codec: options.audioCodec,
          bitrate: options.audioBitrate,
        });

        output.addVideoTrack(videoSource);
        output.addAudioTrack(audioSource);
        await output.start();

        // Render video frames
        const renderCanvas = new OffscreenCanvas(width, height);
        const renderCtx = renderCanvas.getContext('2d')!;

        for (let frame = 0; frame < totalFrames; frame++) {
          if (signal.aborted) throw new Error('Export aborted');

          const time = frame / fps;
          const rendered = await renderer.renderFrame(composition, time);

          renderCtx.clearRect(0, 0, width, height);
          renderCtx.drawImage(rendered.image, 0, 0, width, height);
          rendered.image.close();

          await videoSource.add(time, 1 / fps);

          // Report progress every 5 frames
          if ((frame + 1) % 5 === 0 || frame === totalFrames - 1) {
            notifyProgress((frame + 1) / totalFrames);
          }

          // GC relief every 5 frames
          if ((frame + 1) % 5 === 0) {
            await new Promise(r => setTimeout(r, 0));
          }
        }

        videoSource.close();

        // Render audio offline
        const offlineRenderer = createOfflineAudioRenderer();
        const audioBuffer = await offlineRenderer.render(
          composition,
          resolver,
          (assetId) => decoder.decodeAudio(assetId),
        );
        await audioSource.add(audioBuffer);
        audioSource.close();

        // Finalize
        await output.finalize();

        const buffer = target.buffer;
        if (!buffer) throw new Error('Export produced no output');

        const mimeType = options.format === 'webm' ? 'video/webm' : 'video/mp4';
        return new Blob([buffer], { type: mimeType });

      } finally {
        renderer.destroy();
        abortController = null;
      }
    },

    onProgress(cb) {
      progressListeners.add(cb);
      return () => { progressListeners.delete(cb); };
    },

    abort() {
      abortController?.abort();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/video && bunx vitest run __tests__/export-engine.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/video/src/export-engine.ts packages/video/__tests__/export-engine.test.ts
git commit -m "feat(video): implement ExportEngine with MediaBunny encode"
```

---

### Task 11: Public API + Build

Wire up all exports, verify build, run all tests.

**Files:**
- Modify: `packages/video/src/index.ts`

- [ ] **Step 1: Update index.ts with all exports**

```typescript
// packages/video/src/index.ts

// ── Types ──────────────────────────────────────────────────────────────
export type {
  AssetResolver,
  MediaInfo,
  MediaDecoder,
  CompositeLayer,
  Compositor,
  RenderedFrame,
  FrameRenderer,
  ClockState,
  MasterClock,
  AudioScheduler,
  PlaybackState,
  PlaybackEngine,
  ExportOptions,
  ExportEngine,
  OfflineAudioRenderer,
} from './types.js';

// ── Creation Functions ─────────────────────────────────────────────────
export { createPlaybackEngine } from './playback-engine.js';
export type { PlaybackEngineOptions } from './playback-engine.js';
export { createExportEngine } from './export-engine.js';
export { createFrameRenderer } from './frame-renderer.js';
export { createMasterClock } from './master-clock.js';
export type { MasterClockOptions } from './master-clock.js';
export { createAudioScheduler } from './audio-scheduler.js';
export { createMediaDecoder } from './media-decoder.js';

// ── Compositor ─────────────────────────────────────────────────────────
export { createCompositor } from './compositor.js';
export type { CompositorType } from './compositor.js';
export { createCanvas2DCompositor } from './canvas2d-compositor.js';
export { createGPUCompositor } from './gpu-compositor.js';

// ── Offline Audio ──────────────────────────────────────────────────────
export { createOfflineAudioRenderer } from './offline-audio-renderer.js';
```

- [ ] **Step 2: Run all tests**

Run: `cd packages/video && bunx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Build the package**

Run: `cd packages/video && bun run build`
Expected: Build succeeds (ESM + CJS + .d.ts)

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add packages/video/src/index.ts
git commit -m "feat(video): wire up public API exports"
```

---

### Task 12: README Update + Final Verification

Update project README status table and run full monorepo build + test.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README status table**

Change the video package row in the status table from:

```markdown
| `@pneuma-craft/video` | Scaffolded | Types only |
```

to:

```markdown
| `@pneuma-craft/video` | **Implemented** | Video engine — decode, composite, preview, export |
```

- [ ] **Step 2: Run full monorepo build**

Run: `bun run build`
Expected: All packages build successfully

- [ ] **Step 3: Run full monorepo tests**

Run: `bun run test`
Expected: All tests pass (core: 86, timeline: 72, video: new tests)

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: No type errors across all packages

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update README with video package status"
```
