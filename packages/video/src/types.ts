import type { ResolvedFrame } from '@pneuma-craft/timeline';
import type { Composition } from '@pneuma-craft/timeline';

// ── Compositor ──────────────────────────────────────────────────────────

export interface Compositor {
  readonly canvas: HTMLCanvasElement;
  renderFrame(frame: ResolvedFrame): Promise<void>;
  resize(width: number, height: number): void;
  destroy(): void;
}

// ── Audio Scheduler ─────────────────────────────────────────────────────

export interface AudioScheduler {
  readonly audioContext: AudioContext;
  loadClip(clipId: string, audioBuffer: AudioBuffer): void;
  play(fromTime: number): void;
  pause(): void;
  seek(time: number): void;
  setTrackVolume(trackId: string, volume: number): void;
  setTrackMute(trackId: string, muted: boolean): void;
  destroy(): void;
}

// ── Playback Engine ─────────────────────────────────────────────────────

export interface PlaybackEngine {
  readonly compositor: Compositor;
  readonly audioScheduler: AudioScheduler;
  load(composition: Composition, assetResolver: AssetResolver): Promise<void>;
  play(): void;
  pause(): void;
  seek(time: number): void;
  onFrameRendered(cb: (time: number) => void): () => void;
  destroy(): void;
}

// ── Export ───────────────────────────────────────────────────────────────

export interface ExportOptions {
  format: 'mp4' | 'webm';
  videoCodec: 'avc' | 'vp9' | 'av1';
  audioCodec: 'aac' | 'opus';
  videoBitrate: number;
  audioBitrate: number;
  fps?: number;
}

export interface ExportEngine {
  export(composition: Composition, options: ExportOptions): Promise<Blob>;
  onProgress(cb: (progress: number) => void): () => void;
  abort(): void;
}

// ── Asset Resolver ──────────────────────────────────────────────────────

export interface AssetResolver {
  resolveUrl(assetId: string): string;
  fetchStream(assetId: string): Promise<ReadableStream<Uint8Array>>;
  fetchBlob(assetId: string): Promise<Blob>;
}
