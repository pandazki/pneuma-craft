// ── Compositor ─────────────────────────────────────────────────────────
export { createCanvas2DCompositor } from './canvas2d-compositor.js';
export { createGPUCompositor } from './gpu-compositor.js';
export { createCompositor } from './compositor.js';
export type { CompositorType } from './compositor.js';

// ── Frame Renderer ─────────────────────────────────────────────────────
export { createFrameRenderer } from './frame-renderer.js';

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
