// ── Composition Model ───────────────────────────────────────────────────

export interface CompositionSettings {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly aspectRatio: string;
  readonly sampleRate?: number;
}

export type TrackType = 'video' | 'audio' | 'subtitle';

export interface Track {
  readonly id: string;
  readonly type: TrackType;
  readonly name: string;
  readonly clips: Clip[];
  readonly previewFrames: PreviewFrame[];
  readonly muted: boolean;
  readonly volume: number;
  readonly locked: boolean;
  readonly visible: boolean;
}

export interface Clip {
  readonly id: string;
  readonly assetId: string;
  readonly trackId: string;
  readonly startTime: number;
  readonly duration: number;
  readonly inPoint: number;
  readonly outPoint: number;
  readonly text?: string;
  readonly volume?: number;
  readonly fadeIn?: number;
  readonly fadeOut?: number;
}

// A planning-layer visual attached to a track at a single time point.
// Lets go (does not render) when a real clip on the same track covers that
// moment. Always points at an image asset; carries no duration/transition
// because it is a step-function placeholder, not finished material.
export interface PreviewFrame {
  readonly id: string;
  readonly trackId: string;
  readonly time: number;
  readonly assetId: string;
}

export interface Transition {
  readonly id: string;
  readonly type: 'cut' | 'crossfade' | 'fade-to-black';
  readonly duration: number;
  readonly fromClipId: string;
  readonly toClipId: string;
}

export interface Composition {
  readonly id: string;
  readonly settings: CompositionSettings;
  readonly tracks: Track[];
  readonly transitions: Transition[];
  readonly duration: number;
}

// ── Playback Clock ──────────────────────────────────────────────────────

export interface PlaybackClock {
  readonly currentTime: number;
  readonly playing: boolean;
  readonly playbackRate: number;
  play(fromTime?: number): void;
  pause(): void;
  seek(time: number): void;
  setPlaybackRate(rate: number): void;
  onTimeUpdate(cb: (time: number) => void): () => void;
  onStateChange(cb: (playing: boolean) => void): () => void;
}

// ── Clip Resolution ─────────────────────────────────────────────────────

export interface ResolvedClip {
  readonly clip: Clip;
  readonly track: Track;
  readonly localTime: number;
}

export interface ResolvedPreviewFrame {
  readonly previewFrame: PreviewFrame;
  readonly track: Track;
}

export interface ResolvedFrame {
  readonly time: number;
  readonly clips: ResolvedClip[];
  // Populated only for video tracks where no clip covers `time`. Already
  // mutually exclusive with `clips` per track — consumers do not need to
  // re-derive the let-go decision.
  readonly previewFrames: ResolvedPreviewFrame[];
}

// ── Composition Commands ────────────────────────────────────────────────

export type CompositionCommand =
  | { type: 'composition:create'; settings: CompositionSettings }
  | { type: 'composition:add-track'; track: Omit<Track, 'id' | 'previewFrames'> & { id?: string; previewFrames?: PreviewFrame[] } }
  | { type: 'composition:remove-track'; trackId: string }
  | { type: 'composition:add-clip'; trackId: string; clip: Omit<Clip, 'id' | 'trackId'> & { id?: string } }
  | { type: 'composition:remove-clip'; clipId: string }
  | { type: 'composition:move-clip'; clipId: string; startTime: number; trackId?: string }
  | { type: 'composition:trim-clip'; clipId: string; inPoint?: number; outPoint?: number; duration?: number }
  | { type: 'composition:split-clip'; clipId: string; time: number }
  | { type: 'composition:reorder-tracks'; trackIds: string[] }
  | { type: 'composition:toggle-track-mute'; trackId: string }
  | { type: 'composition:toggle-track-lock'; trackId: string }
  | { type: 'composition:toggle-track-visibility'; trackId: string }
  | { type: 'composition:duplicate-clip'; clipId: string }
  | { type: 'composition:rebind-clip'; clipId: string; assetId: string }
  | { type: 'composition:rename-track'; trackId: string; name: string }
  | {
      type: 'composition:add-preview-frame';
      trackId: string;
      time: number;
      assetId: string;
      id?: string;
    }
  | { type: 'composition:remove-preview-frame'; previewFrameId: string }
  | {
      type: 'composition:move-preview-frame';
      previewFrameId: string;
      time: number;
      trackId?: string;
    }
  | {
      type: 'composition:rebind-preview-frame';
      previewFrameId: string;
      assetId: string;
    };
