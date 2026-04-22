import type { Composition, Clip } from '@pneuma-craft/timeline';

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

// ── Subtitle Renderer ──────────────────────────────────────────────────
//
// Subtitles are rasterized by a caller-supplied function so pneuma-craft
// stays unopinionated about fonts, layout, wrapping, and styling. The same
// renderer is consumed by both the playback engine (preview) and the export
// engine, which is what guarantees visual parity between "what the user sees"
// and "what ends up in the exported MP4/WebM".
//
// The renderer receives the raw subtitle clip plus the composition's pixel
// dimensions and returns a `CanvasImageSource` (typically an `OffscreenCanvas`)
// that the compositor stacks on top of the video layers. Returning `null`
// means "no subtitle to draw at this frame" — use it to skip empty text
// without paying for a canvas allocation.

export interface SubtitleRenderParams {
  /** The subtitle clip being rendered. Read `clip.text` and any custom metadata from here. */
  readonly clip: Clip;
  /** Clip-local time (already offset by `clip.startTime` / `clip.inPoint`). */
  readonly localTime: number;
  /** Composition pixel width — the returned canvas should match this. */
  readonly width: number;
  /** Composition pixel height — the returned canvas should match this. */
  readonly height: number;
}

export type SubtitleRenderer = (
  params: SubtitleRenderParams,
) => CanvasImageSource | null | Promise<CanvasImageSource | null>;

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
  play(fromTime: number, composition: Composition, getCurrentTime?: () => number): void;
  pause(): void;
  seek(time: number, composition: Composition): void;
  setPlaybackRate(rate: number): void;
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
