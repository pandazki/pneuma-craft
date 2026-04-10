# @pneuma-craft/video

Video engine for pneuma-craft — decode, composite, preview playback, and export. Built on [MediaBunny](https://mediabunny.dev) (WebCodecs) for I/O and Canvas 2D / WebGPU for compositing. Pure TypeScript, no React.

## Architecture

```
MediaDecoder          decode video frames + audio buffers from media files
       ↓
FrameRenderer         resolve frame → decode active clips → composite layers
       ↓
PlaybackEngine        rAF loop + MasterClock + AudioScheduler → real-time preview
       ↓
ExportEngine          offline render all frames → encode via WebCodecs → Blob
```

### AssetResolver

All components receive assets by ID. An `AssetResolver` bridges the gap:

```typescript
interface AssetResolver {
  resolveUrl(assetId: string): string;
  fetchBlob(assetId: string): Promise<Blob>;
}
```

## Key Concepts

### Master Clock

Uses `AudioContext.currentTime` as the source of truth for playback synchronization. Tracks drift between audio time and video frame rendering. Supports loop regions and variable playback rate.

```typescript
interface MasterClock {
  readonly currentTime: number;
  readonly state: ClockState;       // 'stopped' | 'playing' | 'paused'
  readonly driftMs: number;
  playbackRate: number;
  duration: number;
  loop: { start: number; end: number } | null;
  play(): void;
  pause(): void;
  seek(time: number): void;
  reportVideoTime(time: number): void;
  onTimeUpdate(cb): () => void;
  onStateChange(cb): () => void;
  destroy(): void;
}
```

### Audio Scheduling

The `AudioScheduler` uses a 100ms tick interval with 200ms look-ahead scheduling. Audio clips are loaded as `AudioBuffer` instances and scheduled via `AudioBufferSourceNode` chains with per-track volume and mute control.

### Compositing

Two backends, selectable at creation:

| Backend | Use case |
|---------|----------|
| `Canvas2DCompositor` | Default fallback, works everywhere |
| `GPUCompositor` | WebGPU-accelerated, better for complex compositions |

Both implement the same `Compositor` interface:

```typescript
interface Compositor {
  composite(layers: CompositeLayer[]): Promise<ImageBitmap>;
  resize(width: number, height: number): void;
  destroy(): void;
}
```

### Frame Rendering

`FrameRenderer` takes a `Composition` and a time, resolves active clips via `resolveFrame()`, decodes each clip's video frame, composites them as layers, and returns a `RenderedFrame` with an `ImageBitmap`.

### Export Pipeline

1. Render video frames sequentially via `FrameRenderer`
2. Render audio offline via `OfflineAudioContext`
3. Encode video with WebCodecs `VideoEncoder`
4. Encode audio with WebCodecs `AudioEncoder`
5. Mux via MediaBunny output → `Blob`

## API Reference

### Creation Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `createPlaybackEngine(options?)` | `PlaybackEngine` | Full preview engine with rAF loop |
| `createExportEngine()` | `ExportEngine` | Offline render + encode to Blob |
| `createFrameRenderer()` | `FrameRenderer` | Single-frame render (used by both engines) |
| `createMasterClock(options?)` | `MasterClock` | AudioContext-based clock |
| `createAudioScheduler(options?)` | `AudioScheduler` | Audio playback scheduler |
| `createMediaDecoder()` | `MediaDecoder` | MediaBunny-based decode |
| `createCompositor(type?)` | `Compositor` | Canvas2D or GPU compositor |
| `createCanvas2DCompositor()` | `Compositor` | Explicit Canvas2D backend |
| `createGPUCompositor()` | `Compositor` | Explicit WebGPU backend |
| `createOfflineAudioRenderer()` | `OfflineAudioRenderer` | Offline audio mixdown |

### PlaybackEngine

```typescript
interface PlaybackEngine {
  readonly state: PlaybackState;     // 'idle' | 'loading' | 'ready' | 'playing' | 'paused'
  readonly currentTime: number;
  playbackRate: number;
  loop: { start: number; end: number } | null;

  load(composition, resolver): Promise<void>;
  play(): void;
  pause(): void;
  seek(time: number): void;
  onStateChange(cb): () => void;
  onTimeUpdate(cb): () => void;
  onFrameRendered(cb): () => void;
  destroy(): void;
}
```

### ExportEngine

```typescript
interface ExportEngine {
  export(composition, options, resolver): Promise<Blob>;
  onProgress(cb: (progress: number) => void): () => void;
  abort(): void;
}
```

### ExportOptions

```typescript
interface ExportOptions {
  format: 'mp4' | 'webm';
  videoCodec: 'avc' | 'vp9' | 'av1';
  audioCodec: 'aac' | 'opus';
  videoBitrate: number;
  audioBitrate: number;
  fps?: number;
  width?: number;
  height?: number;
}
```

## Types Reference

| Type | Description |
|------|-------------|
| `AssetResolver` | `{ resolveUrl(id): string, fetchBlob(id): Promise<Blob> }` |
| `MediaInfo` | `{ duration, width, height, fps, hasVideo, hasAudio, videoCodec, audioCodec, sampleRate, channels }` |
| `MediaDecoder` | Decode video frames and audio buffers |
| `CompositeLayer` | `{ source: CanvasImageSource, opacity: number, zIndex: number }` |
| `Compositor` | Layer compositing interface |
| `RenderedFrame` | `{ image: ImageBitmap, time, width, height }` |
| `FrameRenderer` | Single-frame render interface |
| `ClockState` | `'stopped' \| 'playing' \| 'paused'` |
| `MasterClock` | AudioContext-based clock interface |
| `AudioScheduler` | Audio playback scheduling interface |
| `PlaybackState` | `'idle' \| 'loading' \| 'ready' \| 'playing' \| 'paused'` |
| `PlaybackEngine` | Full preview playback interface |
| `ExportOptions` | Export format/codec/bitrate configuration |
| `ExportEngine` | Offline render and encode interface |
| `OfflineAudioRenderer` | Offline audio mixdown interface |
| `CompositorType` | `'canvas2d' \| 'gpu' \| 'auto'` |
