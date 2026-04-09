# @pneuma-craft/video Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Video engine — decode, composite, preview playback, audio scheduling, export
**Depends on:** @pneuma-craft/timeline, MediaBunny

---

## 1. Purpose

`@pneuma-craft/video` is the runtime rendering engine that consumes timeline's composition model and turns it into pixels and sound. It bridges the gap between the abstract editing model (timeline) and the actual media playback/export.

**What it does:**
- Decode media assets via MediaBunny (WebCodecs-based)
- Composite multi-track video frames (WebGPU primary, Canvas 2D fallback)
- Schedule and play audio in real-time (Web Audio API)
- Orchestrate synchronized preview playback (rAF + AudioContext clock)
- Export compositions to MP4/WebM files

**What it does not do:**
- Manage composition state (that's `@pneuma-craft/timeline`)
- Provide UI components (that's `@pneuma-craft/react`)
- Load or store media files (consumers provide `AssetResolver`)
- Apply audio effects beyond volume/mute/fade (future scope)

**Connection point:** `resolveFrame(composition, time)` from timeline is the sole interface between editing model and rendering engine. Timeline decides *what* plays; video decides *how* to display it.

---

## 2. Architecture

### System Overview

```
Consumer (react / pneuma-skills)
  │
  ├── PlaybackEngine (real-time preview)
  │     ├── MasterClock (AudioContext.currentTime as time source)
  │     ├── FrameRenderer (decode + composite)
  │     │     ├── MediaDecoder (MediaBunny Input + CanvasSink)
  │     │     ├── GPUCompositor (WebGPU, primary path)
  │     │     └── Canvas2DCompositor (fallback)
  │     ├── AudioScheduler (Web Audio API)
  │     │     └── per-track gain/mute + per-clip volume/fade
  │     └── rAF render loop + drift compensation
  │
  └── ExportEngine (offline export)
        ├── FrameRenderer (shared with playback)
        ├── OfflineAudioRenderer (OfflineAudioContext)
        └── MediaBunny Output (encode + mux)
```

### Data Flow

```
                    ┌─────────────────────────────┐
                    │  @pneuma-craft/timeline      │
                    │  resolveFrame(composition, t) │
                    └──────────┬──────────────────┘
                               │ ResolvedFrame
                               ▼
                    ┌──────────────────────┐
                    │   FrameRenderer       │
                    │                       │
  AssetResolver ──► │  MediaDecoder         │
  (consumer         │    ↓ decode per clip  │
   provides)        │  Compositor           │
                    │    ↓ layer by track   │
                    │  → ImageBitmap        │
                    └──────────┬────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                                  ▼
     PlaybackEngine                       ExportEngine
     (→ preview canvas)                   (→ MediaBunny Output → Blob)
```

### Subsystem Dependencies

```
PlaybackEngine
  ├── MasterClock
  ├── FrameRenderer
  │     ├── MediaDecoder
  │     └── Compositor (GPU or Canvas2D)
  └── AudioScheduler

ExportEngine
  ├── FrameRenderer (same instance or new)
  └── OfflineAudioRenderer
```

FrameRenderer is the shared core — both PlaybackEngine and ExportEngine use it to produce composited frames.

---

## 3. Subsystem Design

### 3.1 MediaDecoder

Wraps MediaBunny's decode API. Manages per-asset Input/Sink lifecycle.

```typescript
interface MediaDecoder {
  /**
   * Decode a single video frame at the given time.
   * Creates and caches MediaBunny Input + CanvasSink per assetId.
   */
  decodeVideoFrame(assetId: string, time: number, width: number, height: number): Promise<CanvasImageSource>;

  /**
   * Decode audio for an asset into a Web Audio AudioBuffer.
   * Caches decoded buffers per assetId.
   */
  decodeAudio(assetId: string): Promise<AudioBuffer>;

  /**
   * Get media metadata (duration, dimensions, codec info).
   */
  getMediaInfo(assetId: string): Promise<MediaInfo>;

  /**
   * Release all cached Input/Sink/Buffer resources.
   */
  destroy(): void;
}
```

**Resource management:**
- Per assetId: one `Input` + one `CanvasSink` instance, cached and reused
- CanvasSink `poolSize`: 3-5 for preview, 1 for export (memory efficiency)
- AudioBuffer: cached per assetId after first decode
- Long audio (>120s): segmented decode via MediaBunny `AudioBufferSink` to avoid loading entire file into memory

**MediaBunny usage:**
```typescript
// Video frame decode
const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
const videoTrack = await input.getPrimaryVideoTrack();
const sink = new CanvasSink(videoTrack, { width, height, fit: 'contain', poolSize: 5 });
const result = await sink.getCanvas(timestamp); // result.canvas

// Audio decode
const audioTrack = await input.getPrimaryAudioTrack();
const audioSink = new AudioBufferSink(audioTrack);
const result = await audioSink.getBuffer(0); // result.buffer: AudioBuffer
```

**MediaInfo type:**
```typescript
interface MediaInfo {
  readonly duration: number;        // seconds
  readonly width: number;           // video only
  readonly height: number;          // video only
  readonly fps: number;             // video only
  readonly hasVideo: boolean;
  readonly hasAudio: boolean;
  readonly videoCodec: string | null;
  readonly audioCodec: string | null;
  readonly sampleRate: number;      // audio only
  readonly channels: number;        // audio only
}
```

### 3.2 Compositor

Layers decoded frames by track order into a single composited output. Two implementations behind one interface.

```typescript
interface Compositor {
  /**
   * Composite multiple layers into a single ImageBitmap.
   * Layers are ordered bottom-to-top (first layer = bottom, last = top).
   */
  composite(layers: CompositeLayer[]): Promise<ImageBitmap>;

  /**
   * Resize the compositor output dimensions.
   */
  resize(width: number, height: number): void;

  /**
   * Release GPU/canvas resources.
   */
  destroy(): void;
}

interface CompositeLayer {
  readonly source: CanvasImageSource;
  readonly opacity: number;         // 0-1
  readonly zIndex: number;          // track order
}
```

**GPUCompositor (primary):**
- WebGPU-based layer compositing
- Each layer converted to GPUTexture
- Blend via fragment shader (Porter-Duff over operator)
- Reference: OpenReel `gpu-compositor.ts`

**Canvas2DCompositor (fallback):**
- OffscreenCanvas-based
- `globalAlpha` for opacity
- `drawImage()` for layering
- Simpler but sufficient for basic compositing

**Auto-detection at creation:**
```typescript
async function createCompositor(width: number, height: number): Promise<Compositor> {
  if (navigator.gpu) {
    try {
      return await createGPUCompositor(width, height);
    } catch {
      // WebGPU init failed, fall through
    }
  }
  return createCanvas2DCompositor(width, height);
}
```

### 3.3 FrameRenderer

Orchestrates MediaDecoder + Compositor to produce a single composited frame.

```typescript
interface FrameRenderer {
  /**
   * Render a composited frame at the given time.
   * Calls resolveFrame() internally, decodes each clip, composites layers.
   */
  renderFrame(composition: Composition, time: number): Promise<RenderedFrame>;

  /**
   * Release all resources (decoder caches, compositor).
   */
  destroy(): void;
}

interface RenderedFrame {
  readonly image: ImageBitmap;
  readonly time: number;
  readonly width: number;
  readonly height: number;
}
```

**Render pipeline:**
1. `resolveFrame(composition, time)` → `ResolvedClip[]`
2. Filter video/image clips (skip audio/subtitle for visual rendering)
3. For each clip: `mediaDecoder.decodeVideoFrame(clip.assetId, clip.localTime, ...)`
4. Build `CompositeLayer[]` ordered by track position (bottom track first)
5. `compositor.composite(layers)` → final `ImageBitmap`
6. Return `RenderedFrame`

**Frame cache (preview only, per FrameRenderer instance):**
- LRU cache for recently rendered frames (key = time rounded to frame boundary)
- Configurable size (default: 30 frames)
- Cleared on seek, composition change, or manual flush
- Export creates its own FrameRenderer with cache disabled (sequential access, no reuse)

### 3.4 MasterClock

Single source of truth for timeline time, driven by AudioContext hardware clock.

```typescript
interface MasterClock {
  /** Current timeline time in seconds. */
  readonly currentTime: number;

  /** Current playback state. */
  readonly state: ClockState;

  /** Playback rate (0.25 - 4.0). */
  playbackRate: number;

  /** Timeline duration. */
  duration: number;

  /** Loop region (null = no loop). */
  loop: { start: number; end: number } | null;

  play(): void;
  pause(): void;
  seek(time: number): void;

  /**
   * Report the actual video frame time rendered,
   * used for drift compensation.
   */
  reportVideoTime(time: number): void;

  /**
   * Current drift between audio clock and video rendering.
   * Positive = audio ahead of video (should skip frames).
   */
  readonly driftMs: number;

  /** Subscribe to time/state changes. */
  onTimeUpdate(cb: (time: number) => void): () => void;
  onStateChange(cb: (state: ClockState) => void): () => void;

  destroy(): void;
}

type ClockState = 'stopped' | 'playing' | 'paused';
```

**Time calculation (from OpenReel):**
```typescript
get currentTime(): number {
  if (this.state !== 'playing') return this._seekTime;
  const elapsed = (audioContext.currentTime - startAudioContextTime) * playbackRate;
  let time = startTimelineTime + elapsed;
  if (this.loop) {
    const loopDuration = this.loop.end - this.loop.start;
    time = this.loop.start + ((time - this.loop.start) % loopDuration);
  }
  return Math.max(0, Math.min(time, this.duration));
}
```

**Why AudioContext.currentTime:**
- Driven by audio hardware, microsecond precision
- Not affected by main thread jank
- Audio scheduling must use AudioContext time — using the same clock for video avoids sync issues

### 3.5 AudioScheduler

Real-time audio playback using Web Audio API with look-ahead scheduling.

```typescript
interface AudioScheduler {
  /** The AudioContext used for playback. */
  readonly audioContext: AudioContext;

  /**
   * Load a decoded AudioBuffer for a clip.
   * Called during PlaybackEngine.load() for each audio clip.
   */
  loadClip(clipId: string, audioBuffer: AudioBuffer): void;

  /**
   * Start/resume audio playback from the given timeline time.
   * Schedules clips using look-ahead.
   */
  play(fromTime: number): void;

  /** Pause audio playback. Stop all active source nodes. */
  pause(): void;

  /** Seek to a new time. Stops current sources, reschedules. */
  seek(time: number): void;

  /** Set track volume (0-1). */
  setTrackVolume(trackId: string, volume: number): void;

  /** Mute/unmute a track. */
  setTrackMute(trackId: string, muted: boolean): void;

  /** Release all audio nodes and buffers. */
  destroy(): void;
}
```

**Audio graph topology:**
```
Per active clip:
  AudioBufferSourceNode
    → clip GainNode (per-clip volume + fade automation)
    → track GainNode (per-track volume, mute = gain 0)
    → masterGainNode
    → AudioContext.destination
```

**Scheduling mechanism:**
- **Look-ahead window:** 200ms ahead of current time
- **Scheduler tick:** every 100ms via setInterval
- Each tick: scan for clips entering the look-ahead window, schedule their AudioBufferSourceNode
- `source.start(contextStartTime, sourceOffset, clipDuration)` — maps timeline time to AudioContext time

**Fade automation:**
```typescript
// fadeIn
gainNode.gain.setValueAtTime(0, clipContextStart);
gainNode.gain.linearRampToValueAtTime(clip.volume, clipContextStart + clip.fadeIn);

// fadeOut
const fadeOutStart = clipContextStart + clip.duration - clip.fadeOut;
gainNode.gain.setValueAtTime(clip.volume, fadeOutStart);
gainNode.gain.linearRampToValueAtTime(0, clipContextStart + clip.duration);
```

**Seek behavior:**
1. Stop all active AudioBufferSourceNodes (`.stop()`)
2. Clear scheduled nodes
3. Reschedule from new position using look-ahead

### 3.6 PlaybackEngine

Orchestrates all subsystems for synchronized real-time preview.

```typescript
type PlaybackState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused';

interface PlaybackEngine {
  /** Current playback state. */
  readonly state: PlaybackState;

  /** Current timeline time. */
  readonly currentTime: number;

  /** Playback rate. */
  playbackRate: number;

  /** Loop region. */
  loop: { start: number; end: number } | null;

  /**
   * Load a composition for playback.
   * Initializes decoder, compositor, audio scheduler.
   * Decodes first frame for immediate display.
   * Pre-loads audio buffers.
   */
  load(composition: Composition, resolver: AssetResolver): Promise<void>;

  /** Start or resume playback. */
  play(): void;

  /** Pause playback. */
  pause(): void;

  /** Seek to a specific time. Renders the frame at that time. */
  seek(time: number): void;

  /** Subscribe to state changes. */
  onStateChange(cb: (state: PlaybackState) => void): () => void;

  /** Subscribe to time updates (fires every rAF). */
  onTimeUpdate(cb: (time: number) => void): () => void;

  /** Subscribe to rendered frames. */
  onFrameRendered(cb: (frame: RenderedFrame) => void): () => void;

  /** Release all resources. */
  destroy(): void;
}
```

**State machine:**
```
idle ──load()──► loading ──done──► ready
                                    │
                              play() │ pause()
                                    ▼
                                 playing ◄──► paused
                                    │
                              destroy()
                                    ▼
                                  idle
```

**rAF render loop:**
```typescript
function renderLoop() {
  if (state !== 'playing') return;

  const time = masterClock.currentTime;

  // Drift compensation
  if (masterClock.driftMs > frameDurationMs) {
    // Audio ahead — skip this video frame
    masterClock.reportVideoTime(time);
    requestAnimationFrame(renderLoop);
    return;
  }

  frameRenderer.renderFrame(composition, time).then(frame => {
    drawToCanvas(targetCanvas, frame.image);
    masterClock.reportVideoTime(time);
    emitFrameRendered(frame);
    emitTimeUpdate(time);

    if (time >= composition.duration && !loop) {
      pause();
      return;
    }
    requestAnimationFrame(renderLoop);
  });
}
```

**load() sequence:**
1. Set state to `loading`
2. Initialize AudioContext, MasterClock
3. Create MediaDecoder with AssetResolver
4. Create Compositor (auto-detect WebGPU/Canvas2D)
5. Create FrameRenderer
6. Pre-decode audio buffers for all audio clips → load into AudioScheduler
7. Render first frame for immediate display
8. Set state to `ready`

### 3.7 ExportEngine

Offline sequential rendering + encoding via MediaBunny Output.

```typescript
interface ExportEngine {
  /**
   * Export a composition to a media file.
   * Renders every frame sequentially, encodes via MediaBunny.
   */
  export(
    composition: Composition,
    options: ExportOptions,
    resolver: AssetResolver,
  ): Promise<Blob>;

  /** Subscribe to export progress (0-1). */
  onProgress(cb: (progress: number) => void): () => void;

  /** Cancel an in-progress export. */
  abort(): void;
}

interface ExportOptions {
  readonly format: 'mp4' | 'webm';
  readonly videoCodec: 'avc' | 'vp9' | 'av1';
  readonly audioCodec: 'aac' | 'opus';
  readonly videoBitrate: number;
  readonly audioBitrate: number;
  readonly fps?: number;            // default: composition.settings.fps
  readonly width?: number;          // default: composition.settings.width
  readonly height?: number;         // default: composition.settings.height
}
```

**Export pipeline:**
```
1. Video encoding (frame-by-frame):
   for frame = 0 to totalFrames:
     time = frame / fps
     imageBitmap = frameRenderer.renderFrame(composition, time)
     → draw to OffscreenCanvas
     → CanvasSource.add(canvas, timestamp)
     yield progress every 5 frames

2. Audio encoding:
   OfflineAudioContext (duration, sampleRate, channels)
   → schedule all audio clips with volume/fade
   → offlineCtx.startRendering() → AudioBuffer
   → AudioBufferSource.add(buffer)

3. Muxing:
   MediaBunny Output({
     format: Mp4OutputFormat / WebMOutputFormat,
     target: BufferTarget
   })
   → addVideoTrack(canvasSource)
   → addAudioTrack(audioBufferSource)
   → start() → finalize()
   → new Blob([target.buffer])
```

**Memory management during export:**
- Clear frame cache every 5 frames
- `await new Promise(r => setTimeout(r, 0))` every N frames for GC pressure relief
- Separate MediaDecoder instance for export (different CanvasSink poolSize = 1)

**Abort handling:**
- AbortController internally
- On abort: stop frame loop, cancel MediaBunny output, reject promise

---

## 4. AssetResolver

Defined by video, implemented by consumers. The only way the video engine accesses media files.

```typescript
interface AssetResolver {
  /**
   * Resolve an asset ID to a fetchable URL.
   * Used for metadata inspection.
   */
  resolveUrl(assetId: string): string;

  /**
   * Fetch the raw media file as a Blob.
   * Used by MediaDecoder to create MediaBunny Input.
   */
  fetchBlob(assetId: string): Promise<Blob>;
}
```

Note: `fetchStream` is removed from the scaffolded interface — MediaBunny's `BlobSource` is the primary input path, and streaming decode adds complexity without clear MVP benefit.

---

## 5. Types Update

The existing `types.ts` scaffolding needs to be updated to match this design. Key changes:

- **Compositor:** Remove `canvas` property (compositor is internal, not directly exposed). Return `ImageBitmap` from `composite()` instead of rendering to a fixed canvas.
- **PlaybackEngine:** Add `state`, `currentTime`, `playbackRate`, `loop`, `onStateChange`, `onTimeUpdate`. Remove direct `compositor`/`audioScheduler` exposure (internal detail).
- **ExportEngine:** Add `resolver` parameter to `export()`.
- **AssetResolver:** Remove `fetchStream` (not needed for MVP).
- **Add new types:** `FrameRenderer`, `MediaDecoder`, `MasterClock`, `RenderedFrame`, `CompositeLayer`, `MediaInfo`, `PlaybackState`, `ClockState`.

---

## 6. File Structure

```
packages/video/
├── src/
│   ├── types.ts                    # All public interfaces and types
│   ├── media-decoder.ts            # MediaBunny decode wrapper + cache
│   ├── compositor.ts               # Compositor interface + createCompositor()
│   ├── gpu-compositor.ts           # WebGPU implementation
│   ├── canvas2d-compositor.ts      # Canvas 2D fallback implementation
│   ├── frame-renderer.ts           # resolveFrame → decode → composite
│   ├── master-clock.ts             # AudioContext-driven timeline clock
│   ├── audio-scheduler.ts          # Web Audio API real-time scheduling
│   ├── playback-engine.ts          # Orchestrates preview playback
│   ├── offline-audio-renderer.ts   # OfflineAudioContext for export
│   ├── export-engine.ts            # Sequential render + MediaBunny encode
│   └── index.ts                    # Public exports
├── __tests__/
│   ├── media-decoder.test.ts
│   ├── gpu-compositor.test.ts
│   ├── canvas2d-compositor.test.ts
│   ├── frame-renderer.test.ts
│   ├── master-clock.test.ts
│   ├── audio-scheduler.test.ts
│   ├── playback-engine.test.ts
│   ├── offline-audio-renderer.test.ts
│   └── export-engine.test.ts
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## 7. Testing Strategy

### Challenge: Browser APIs

Video package depends on browser-only APIs: WebGPU, Canvas, Web Audio, WebCodecs (via MediaBunny). Testing strategies:

**Unit-testable (pure logic, mock browser APIs):**
- MasterClock time calculation (mock AudioContext.currentTime)
- FrameRenderer orchestration (mock MediaDecoder + Compositor)
- AudioScheduler scheduling logic (mock AudioContext + nodes)
- ExportEngine pipeline orchestration (mock FrameRenderer + MediaBunny)
- Drift compensation logic

**Integration-testable (needs real browser via @vitest/browser):**
- Canvas2DCompositor layer compositing
- MediaDecoder with real video files
- GPUCompositor (needs WebGPU support)
- Full PlaybackEngine playback cycle
- Full ExportEngine encode pipeline

**Test approach:**
- Mock factories for browser APIs: `createMockAudioContext()`, `createMockCanvasImageSource()`
- Pure logic tests run in Vitest (Node/Bun)
- Browser integration tests run via `@vitest/browser` (already in dev deps)
- Test media fixtures: small video/audio files in `__tests__/fixtures/`

### Key Test Scenarios

**MasterClock:**
- Time advances correctly with playbackRate
- Seek sets time immediately
- Loop wraps around correctly
- Drift calculation accuracy

**FrameRenderer:**
- Single clip at time → correct decode call
- Multiple overlapping clips → correct layer order
- Time outside any clip → empty frame
- Muted track clips excluded

**AudioScheduler:**
- Clips scheduled at correct AudioContext time
- Fade automation applied correctly
- Seek stops old sources, schedules new
- Track mute sets gain to 0

**ExportEngine:**
- Frame count matches duration * fps
- Progress callback fires correctly
- Abort cancels mid-export

---

## 8. Public API

```typescript
// ── Creation functions ──────────────────────────────────────────────

/** Create a playback engine for real-time preview. */
function createPlaybackEngine(): PlaybackEngine;

/** Create an export engine for offline rendering. */
function createExportEngine(): ExportEngine;

/** Create a frame renderer (used internally, exposed for advanced use). */
function createFrameRenderer(
  resolver: AssetResolver,
  options?: { compositorType?: 'gpu' | 'canvas2d'; cacheSize?: number }
): Promise<FrameRenderer>;

// ── Re-exports ──────────────────────────────────────────────────────

// All interfaces from types.ts:
// Compositor, CompositeLayer,
// AudioScheduler,
// PlaybackEngine, PlaybackState,
// ExportEngine, ExportOptions,
// FrameRenderer, RenderedFrame,
// MasterClock, ClockState,
// MediaDecoder, MediaInfo,
// AssetResolver
```

---

## 9. MVP Scope

**In scope:**
- MediaDecoder: video frame decode + audio decode via MediaBunny
- GPUCompositor + Canvas2DCompositor with auto-detection
- FrameRenderer: resolveFrame → decode → composite pipeline
- MasterClock: AudioContext-driven with playbackRate, loop, drift
- AudioScheduler: per-track gain/mute, per-clip volume/fade, look-ahead scheduling
- PlaybackEngine: rAF loop, state machine, load/play/pause/seek
- ExportEngine: sequential frame render + MediaBunny encode to Blob
- OfflineAudioRenderer: OfflineAudioContext for export audio

**Out of scope (future):**
- Audio effects chain (compressor, EQ, reverb, delay)
- Video effects / filters
- Transition rendering (crossfade, wipe, etc.)
- Thumbnail generation / waveform extraction
- Picture-in-picture
- Multi-canvas output
- Streaming export (progressive download)
- Worker-based rendering
