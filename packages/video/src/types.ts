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
