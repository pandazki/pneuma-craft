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
import type {
  Composition,
  CompositionSettings,
  Track,
  Clip,
  PreviewFrame,
  ResolvedFrame,
  ResolvedClip,
  ResolvedPreviewFrame,
} from '@pneuma-craft/timeline';

// ── Composition Factories ──────────────────────────────────────────────

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
    previewFrames: [],
    muted: false,
    volume: 1,
    locked: false,
    visible: true,
    ...overrides,
  };
}

export function createMockPreviewFrame(overrides: Partial<PreviewFrame> = {}): PreviewFrame {
  return {
    id: 'pf-1',
    trackId: 'track-1',
    time: 0,
    assetId: 'image-asset-1',
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
    createBuffer: vi.fn((channels: number, length: number, sampleRate: number) =>
      createMockAudioBuffer(length / sampleRate, sampleRate, channels),
    ),
    // Reject by default so tests exercise the MediaBunny fallback path.
    // Individual tests override this to test the decodeAudioData fast path.
    decodeAudioData: vi.fn().mockRejectedValue(new Error('mock decodeAudioData default reject')),
    resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
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

export function createMockAudioBuffer(
  duration = 5,
  sampleRate = 48000,
  numberOfChannels = 2,
): AudioBuffer {
  const length = Math.ceil(duration * sampleRate);
  const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  return {
    duration,
    length,
    sampleRate,
    numberOfChannels,
    getChannelData: vi.fn((i: number) => channels[i] ?? channels[0]),
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

export function createMockResolvedFrame(
  time: number,
  clips: ResolvedClip[] = [],
  previewFrames: ResolvedPreviewFrame[] = [],
): ResolvedFrame {
  return { time, clips, previewFrames };
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
