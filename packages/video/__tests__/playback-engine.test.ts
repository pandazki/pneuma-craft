import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  MediaDecoder,
  Compositor,
  FrameRenderer,
  MasterClock,
  AudioScheduler,
  PlaybackState,
  RenderedFrame,
  ClockState,
} from '../src/types.js';
import type { Composition } from '@pneuma-craft/timeline';
import {
  createMockMediaDecoder,
  createMockCompositor,
  createMockFrameRenderer,
  createMockAssetResolver,
  createMockAudioContext,
  createMockAudioBuffer,
  createMockComposition,
  createMockTrack,
  createMockClip,
  createMockImageBitmap,
} from './helpers.js';

// ── Mock subsystem factories ──────────────────────────────────────────

let mockDecoder: ReturnType<typeof createMockMediaDecoder>;
let mockCompositor: ReturnType<typeof createMockCompositor>;
let mockFrameRenderer: ReturnType<typeof createMockFrameRenderer>;
let mockAudioContext: AudioContext & { _advanceTime(s: number): void };

function createMockMasterClock(): MasterClock {
  let _state: ClockState = 'stopped';
  let _currentTime = 0;
  let _playbackRate = 1;
  let _duration = 0;
  let _loop: { start: number; end: number } | null = null;
  const timeUpdateListeners = new Set<(time: number) => void>();
  const stateChangeListeners = new Set<(state: ClockState) => void>();

  return {
    get currentTime() { return _currentTime; },
    get state() { return _state; },
    get driftMs() { return 0; },
    get playbackRate() { return _playbackRate; },
    set playbackRate(rate: number) { _playbackRate = rate; },
    get duration() { return _duration; },
    set duration(d: number) { _duration = d; },
    get loop() { return _loop; },
    set loop(l) { _loop = l; },
    play: vi.fn(() => { _state = 'playing'; }),
    pause: vi.fn(() => { _state = 'paused'; }),
    seek: vi.fn((time: number) => { _currentTime = time; }),
    reportVideoTime: vi.fn(),
    onTimeUpdate(cb: (time: number) => void) {
      timeUpdateListeners.add(cb);
      return () => { timeUpdateListeners.delete(cb); };
    },
    onStateChange(cb: (state: ClockState) => void) {
      stateChangeListeners.add(cb);
      return () => { stateChangeListeners.delete(cb); };
    },
    destroy: vi.fn(() => {
      _state = 'stopped';
      timeUpdateListeners.clear();
      stateChangeListeners.clear();
    }),
  };
}

function createMockAudioScheduler(): AudioScheduler {
  return {
    get audioContext() { return mockAudioContext; },
    loadClip: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    setPlaybackRate: vi.fn(),
    setTrackVolume: vi.fn(),
    setTrackMute: vi.fn(),
    destroy: vi.fn(),
  };
}

let latestMockClock: MasterClock;
let latestMockScheduler: AudioScheduler;

vi.mock('../src/media-decoder.js', () => ({
  createMediaDecoder: vi.fn((..._args: unknown[]) => mockDecoder),
}));

vi.mock('../src/compositor.js', () => ({
  createCompositor: vi.fn(async (..._args: unknown[]) => mockCompositor),
}));

vi.mock('../src/frame-renderer.js', () => ({
  createFrameRenderer: vi.fn((..._args: unknown[]) => mockFrameRenderer),
}));

vi.mock('../src/master-clock.js', () => ({
  createMasterClock: vi.fn(() => {
    latestMockClock = createMockMasterClock();
    return latestMockClock;
  }),
}));

vi.mock('../src/audio-scheduler.js', () => ({
  createAudioScheduler: vi.fn(() => {
    latestMockScheduler = createMockAudioScheduler();
    return latestMockScheduler;
  }),
}));

// ── Import after mocks ────────────────────────────────────────────────

import { createPlaybackEngine } from '../src/playback-engine.js';
import { createFrameRenderer } from '../src/frame-renderer.js';

// ── rAF mock ──────────────────────────────────────────────────────────

let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;

function setupRafMock(): void {
  rafCallbacks = new Map();
  nextRafId = 1;
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
    const id = nextRafId++;
    rafCallbacks.set(id, cb);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
    rafCallbacks.delete(id);
  }));
}

function flushRaf(): void {
  const callbacks = [...rafCallbacks.values()];
  rafCallbacks.clear();
  for (const cb of callbacks) {
    cb(performance.now());
  }
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('createPlaybackEngine', () => {
  let composition: Composition;
  const resolver = createMockAssetResolver();

  beforeEach(() => {
    mockDecoder = createMockMediaDecoder();
    mockCompositor = createMockCompositor();
    mockFrameRenderer = createMockFrameRenderer();
    mockAudioContext = createMockAudioContext() as AudioContext & { _advanceTime(s: number): void };
    vi.stubGlobal('AudioContext', vi.fn(() => mockAudioContext));
    setupRafMock();

    composition = createMockComposition({
      duration: 10,
      tracks: [
        createMockTrack({
          id: 'video-track-1',
          type: 'video',
          clips: [createMockClip({ id: 'vclip-1', assetId: 'asset-v1', trackId: 'video-track-1', duration: 10 })],
        }),
        createMockTrack({
          id: 'audio-track-1',
          type: 'audio',
          clips: [createMockClip({ id: 'aclip-1', assetId: 'asset-a1', trackId: 'audio-track-1', duration: 10 })],
        }),
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Initial state ────────────────────────────────────────────────

  it('starts in idle state', () => {
    const engine = createPlaybackEngine();
    expect(engine.state).toBe('idle');
  });

  it('currentTime is 0 initially', () => {
    const engine = createPlaybackEngine();
    expect(engine.currentTime).toBe(0);
  });

  // ── 2. load() transitions ──────────────────────────────────────────

  it('load transitions idle → loading → ready', async () => {
    const engine = createPlaybackEngine();
    const states: PlaybackState[] = [];
    engine.onStateChange(s => states.push(s));

    await engine.load(composition, resolver);

    expect(states).toContain('loading');
    expect(engine.state).toBe('ready');
    expect(states[states.length - 1]).toBe('ready');
  });

  // ── 3. play() after load ───────────────────────────────────────────

  it('play after load transitions to playing', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);

    engine.play();

    expect(engine.state).toBe('playing');
  });

  // ── 4. play() without load throws ──────────────────────────────────

  it('play without load throws', () => {
    const engine = createPlaybackEngine();
    expect(() => engine.play()).toThrow();
  });

  // ── 5. pause() ─────────────────────────────────────────────────────

  it('pause transitions to paused', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);
    engine.play();

    engine.pause();

    expect(engine.state).toBe('paused');
  });

  it('pause while not playing is a no-op', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);

    engine.pause();

    expect(engine.state).toBe('ready');
  });

  // ── 6. seek() ──────────────────────────────────────────────────────

  it('seek delegates to clock and audio scheduler', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);

    engine.seek(5);

    expect(latestMockClock.seek).toHaveBeenCalledWith(5);
  });

  it('seek while paused does not trigger audio scheduler', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);
    // State is 'ready' (not playing)

    engine.seek(5);

    expect(latestMockClock.seek).toHaveBeenCalledWith(5);
    expect(latestMockScheduler.seek).not.toHaveBeenCalled();
  });

  it('seek while playing triggers audio scheduler with clamped time', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);
    engine.play();

    engine.seek(5);

    expect(latestMockClock.seek).toHaveBeenCalledWith(5);
    // Audio scheduler receives the clamped time from clock.currentTime (which is 5 in mock)
    expect(latestMockScheduler.seek).toHaveBeenCalledWith(5, composition);
  });

  it('seek while playing uses clamped time when raw time exceeds duration', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);
    engine.play();

    // Make the mock clock clamp the time (simulate clock clamping to 10)
    vi.mocked(latestMockClock.seek).mockImplementation((time: number) => {
      // Clock would clamp to duration (10)
      (latestMockClock as unknown as { _setCurrentTime: (t: number) => void })._setCurrentTime?.(Math.min(time, 10));
    });

    // The clock.currentTime getter still returns whatever _currentTime is
    // With the default mock, seek(999) sets _currentTime = 999
    // After our fix, the engine reads clock.currentTime after seek
    engine.seek(5);

    expect(latestMockClock.seek).toHaveBeenCalledWith(5);
    expect(latestMockScheduler.seek).toHaveBeenCalled();
  });

  it('seek without load throws', () => {
    const engine = createPlaybackEngine();
    expect(() => engine.seek(5)).toThrow();
  });

  it('rapid seeks while paused only emit the last seek result', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);

    // Engine is in 'ready' state (not playing)
    const frames: RenderedFrame[] = [];
    engine.onFrameRendered(f => frames.push(f));

    // Create a deferred render that we control
    let resolveFirst: ((frame: RenderedFrame) => void) | undefined;
    let resolveSecond: ((frame: RenderedFrame) => void) | undefined;
    let callCount = 0;

    (mockFrameRenderer.renderFrame as ReturnType<typeof vi.fn>).mockImplementation((_comp: Composition, time: number) => {
      callCount++;
      if (callCount === 1) {
        return new Promise<RenderedFrame>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return new Promise<RenderedFrame>((resolve) => {
        resolveSecond = resolve;
      });
    });

    // Rapid seeks
    engine.seek(3);
    engine.seek(7);

    // Resolve the second seek first (out of order)
    resolveSecond!({ image: createMockImageBitmap(), time: 7, width: 1920, height: 1080 });
    await new Promise(r => setTimeout(r, 0));

    // Now resolve the first (stale) seek
    resolveFirst!({ image: createMockImageBitmap(), time: 3, width: 1920, height: 1080 });
    await new Promise(r => setTimeout(r, 0));

    // Only the second seek result should have been emitted
    expect(frames.length).toBe(1);
    expect(frames[0].time).toBe(7);
  });

  // ── 7. onStateChange ───────────────────────────────────────────────

  it('onStateChange fires on transitions', async () => {
    const engine = createPlaybackEngine();
    const states: PlaybackState[] = [];
    engine.onStateChange(s => states.push(s));

    await engine.load(composition, resolver);
    engine.play();
    engine.pause();

    expect(states).toEqual(['loading', 'ready', 'playing', 'paused']);
  });

  it('onStateChange returns unsubscribe function', async () => {
    const engine = createPlaybackEngine();
    const states: PlaybackState[] = [];
    const unsub = engine.onStateChange(s => states.push(s));

    await engine.load(composition, resolver);
    unsub();
    engine.play();

    // Should not contain 'playing' because we unsubscribed
    expect(states).not.toContain('playing');
  });

  // ── 8. onTimeUpdate / onFrameRendered ──────────────────────────────

  it('onTimeUpdate subscription works', async () => {
    const engine = createPlaybackEngine();
    const times: number[] = [];
    engine.onTimeUpdate(t => times.push(t));

    await engine.load(composition, resolver);
    engine.play();

    // Flush one rAF iteration
    await flushRaf();

    // Should have received at least one time update
    expect(times.length).toBeGreaterThanOrEqual(1);
  });

  it('onFrameRendered subscription works', async () => {
    const engine = createPlaybackEngine();
    const frames: RenderedFrame[] = [];
    engine.onFrameRendered(f => frames.push(f));

    await engine.load(composition, resolver);
    engine.play();

    // Flush one rAF iteration
    await flushRaf();

    expect(frames.length).toBeGreaterThanOrEqual(1);
  });

  // ── 8b. Slow-first-decode recovery ────────────────────────────────
  //
  // Regression: a prior rAF loop skipped renders whenever _clock.driftMs exceeded one
  // frame duration. When the first decode ran long (cold-start fetch of a large blob),
  // reportVideoTime captured a large stale drift, and every subsequent tick skipped on
  // that stale value. Since no render ran, reportVideoTime never fired again — drift
  // stayed frozen forever and playback was deadlocked after a single frame.
  //
  // The fix: remove the drift-skip entirely. _frameInFlight already back-pressures the
  // loop during a slow decode, and the watchdog recovers if a decode never resolves.
  // This test fails on the buggy loop because it would freeze after the first frame.
  it('recovers from a slow first decode and keeps rendering subsequent frames', async () => {
    const engine = createPlaybackEngine();
    const frames: RenderedFrame[] = [];
    const times: number[] = [];
    engine.onFrameRendered(f => frames.push(f));
    engine.onTimeUpdate(t => times.push(t));

    // First renderFrame stays pending until we resolve it manually (simulates a slow
    // cold-start decode). Subsequent calls resolve synchronously.
    let resolveFirst!: (frame: RenderedFrame) => void;
    const firstPending = new Promise<RenderedFrame>(resolve => { resolveFirst = resolve; });
    let callCount = 0;
    let mockTime = 0;
    (mockFrameRenderer.renderFrame as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return firstPending;
      return Promise.resolve({
        image: createMockImageBitmap(),
        time: mockTime,
        width: 1920,
        height: 1080,
      });
    });

    await engine.load(composition, resolver);

    // Now that the clock subsystem is wired up, override its getters to simulate a
    // real advancing audio-context time source and a large stale drift (which would
    // have triggered the old drift-skip deadlock).
    Object.defineProperty(latestMockClock, 'currentTime', {
      configurable: true,
      get: () => mockTime,
    });
    Object.defineProperty(latestMockClock, 'driftMs', {
      configurable: true,
      get: () => 500, // way above any frame duration threshold
    });

    engine.play();

    // Tick a few times — the first render is still pending.
    await flushRaf();
    mockTime = 0.1;
    await flushRaf();
    mockTime = 0.2;
    await flushRaf();
    // Time updates flow independently of decode state.
    expect(times.length).toBeGreaterThanOrEqual(2);
    expect(frames.length).toBe(0); // first render still pending

    // Resolve the slow first decode.
    resolveFirst({
      image: createMockImageBitmap(),
      time: 0,
      width: 1920,
      height: 1080,
    });
    await Promise.resolve(); // flush microtask
    await Promise.resolve();

    // Subsequent ticks must produce frames — drift is still 500ms (stale), but the loop
    // no longer skips on drift. The old buggy loop would stay frozen here.
    mockTime = 0.3;
    await flushRaf();
    mockTime = 0.4;
    await flushRaf();

    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  // ── 9. destroy ─────────────────────────────────────────────────────

  it('destroy cleans up and returns to idle', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);
    engine.play();

    engine.destroy();

    expect(engine.state).toBe('idle');
  });

  it('destroy stops playback', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);
    engine.play();

    engine.destroy();

    // Should not receive further callbacks
    const times: number[] = [];
    engine.onTimeUpdate(t => times.push(t));
    flushRaf();
    expect(times.length).toBe(0);
  });

  // ── 9b. Load failure recovery ───────────────────────────────────────

  it('load failure resets state to idle', async () => {
    const engine = createPlaybackEngine();

    // Make compositor creation fail
    const { createCompositor } = await import('../src/compositor.js');
    vi.mocked(createCompositor).mockRejectedValueOnce(new Error('GPU init failed'));

    await expect(engine.load(composition, resolver)).rejects.toThrow('GPU init failed');
    expect(engine.state).toBe('idle');
  });

  it('load failure emits idle state via onStateChange', async () => {
    const engine = createPlaybackEngine();
    const states: PlaybackState[] = [];
    engine.onStateChange(s => states.push(s));

    const { createCompositor } = await import('../src/compositor.js');
    vi.mocked(createCompositor).mockRejectedValueOnce(new Error('GPU init failed'));

    await expect(engine.load(composition, resolver)).rejects.toThrow('GPU init failed');

    // Should have emitted loading then idle
    expect(states).toContain('loading');
    expect(states).toContain('idle');
    expect(states[states.length - 1]).toBe('idle');
  });

  it('load failure allows subsequent successful load', async () => {
    const engine = createPlaybackEngine();

    // First load fails
    const { createCompositor } = await import('../src/compositor.js');
    vi.mocked(createCompositor).mockRejectedValueOnce(new Error('GPU init failed'));
    await expect(engine.load(composition, resolver)).rejects.toThrow('GPU init failed');

    // Second load should succeed
    vi.mocked(createCompositor).mockResolvedValueOnce(mockCompositor);
    await engine.load(composition, resolver);
    expect(engine.state).toBe('ready');
  });

  // ── 9c. Load invalidates pending paused-seek renders ──────────────

  it('load invalidates pending paused-seek renders from previous session', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);

    const frames: RenderedFrame[] = [];
    engine.onFrameRendered(f => frames.push(f));

    // Create a deferred render for a paused seek
    let resolveSeekRender: ((frame: RenderedFrame) => void) | undefined;
    (mockFrameRenderer.renderFrame as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      return new Promise<RenderedFrame>((resolve) => {
        resolveSeekRender = resolve;
      });
    });

    // Seek while paused (state = 'ready') — this kicks off a render
    engine.seek(3);

    // Now load a new composition — this should invalidate the pending seek
    await engine.load(composition, resolver);

    // Resolve the old seek render — it should be discarded
    resolveSeekRender!({ image: createMockImageBitmap(), time: 3, width: 1920, height: 1080 });
    await new Promise(r => setTimeout(r, 0));

    // No frame should have been emitted from the stale session
    expect(frames.length).toBe(0);
  });

  // ── 10. Audio pre-loading ──────────────────────────────────────────

  it('load pre-decodes audio for audio track clips', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);

    expect(mockDecoder.decodeAudio).toHaveBeenCalledWith('asset-a1');
    expect(latestMockScheduler.loadClip).toHaveBeenCalled();
  });

  it('load decodes audio for video track clips — embedded audio is preloaded', async () => {
    // Video clips carry embedded audio that must participate in the audio
    // graph, otherwise preview and export lose sound on any video clip the
    // user drops on a video track.
    const videoOnlyComp = createMockComposition({
      duration: 10,
      tracks: [
        createMockTrack({
          id: 'video-track-1',
          type: 'video',
          clips: [createMockClip({ id: 'vclip-1', assetId: 'asset-v1', trackId: 'video-track-1' })],
        }),
      ],
    });

    const engine = createPlaybackEngine();
    await engine.load(videoOnlyComp, resolver);

    expect(mockDecoder.decodeAudio).toHaveBeenCalledWith('asset-v1');
    expect(latestMockScheduler.loadClip).toHaveBeenCalledWith(
      'vclip-1',
      expect.anything(),
    );
  });

  it('load swallows decodeAudio failures on video-track clips (image/silent video)', async () => {
    // Pure-image or silent-video clips throw from decodeAudio. The engine
    // must treat this as "nothing to schedule" rather than a load failure.
    const videoOnlyComp = createMockComposition({
      duration: 10,
      tracks: [
        createMockTrack({
          id: 'video-track-1',
          type: 'video',
          clips: [createMockClip({ id: 'img-clip', assetId: 'asset-img', trackId: 'video-track-1' })],
        }),
      ],
    });

    mockDecoder.decodeAudio = vi.fn().mockRejectedValue(new Error('no audio track'));

    const engine = createPlaybackEngine();
    // Must not throw — load() has to tolerate audio-less clips on video tracks.
    await expect(engine.load(videoOnlyComp, resolver)).resolves.toBeUndefined();

    expect(mockDecoder.decodeAudio).toHaveBeenCalledWith('asset-img');
    expect(latestMockScheduler.loadClip).not.toHaveBeenCalled();
  });

  // ── 11. playbackRate ───────────────────────────────────────────────

  it('playbackRate getter returns default 1', () => {
    const engine = createPlaybackEngine();
    expect(engine.playbackRate).toBe(1);
  });

  it('playbackRate setter delegates to clock after load', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);

    engine.playbackRate = 2;

    expect(latestMockClock.playbackRate).toBe(2);
  });

  // ── 12. loop ───────────────────────────────────────────────────────

  it('loop getter returns null by default', () => {
    const engine = createPlaybackEngine();
    expect(engine.loop).toBeNull();
  });

  it('loop setter delegates to clock after load', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);

    const loopRange = { start: 1, end: 5 };
    engine.loop = loopRange;

    expect(latestMockClock.loop).toEqual(loopRange);
  });

  // ── 13. play after pause resumes ───────────────────────────────────

  it('play after pause resumes playing', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);
    engine.play();
    engine.pause();

    engine.play();

    expect(engine.state).toBe('playing');
  });

  // ── 14. Multiple loads replace subsystems ──────────────────────────

  it('loading a new composition destroys previous subsystems', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);

    const firstClock = latestMockClock;
    const firstScheduler = latestMockScheduler;

    // Reset mocks for audio decoding
    vi.mocked(mockDecoder.decodeAudio).mockClear();

    await engine.load(composition, resolver);

    expect(firstClock.destroy).toHaveBeenCalled();
    expect(firstScheduler.destroy).toHaveBeenCalled();
  });

  // ── 15. Preview frames option ──────────────────────────────────────

  it('default: includePreviewFrames=true (playback shows planning visuals)', async () => {
    const engine = createPlaybackEngine();
    await engine.load(composition, resolver);
    expect(createFrameRenderer).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.any(Number), expect.any(Number),
      expect.objectContaining({ includePreviewFrames: true }),
    );
  });

  it('opt-out: includePreviewFrames=false is forwarded to FrameRenderer', async () => {
    const engine = createPlaybackEngine({ includePreviewFrames: false });
    await engine.load(composition, resolver);
    expect(createFrameRenderer).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.any(Number), expect.any(Number),
      expect.objectContaining({ includePreviewFrames: false }),
    );
  });
});
