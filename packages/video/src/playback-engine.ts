import type {
  PlaybackEngine,
  PlaybackState,
  RenderedFrame,
  AssetResolver,
  MediaDecoder,
  Compositor,
  FrameRenderer,
  MasterClock,
  AudioScheduler,
  SubtitleRenderer,
} from './types.js';
import type { Composition } from '@pneuma-craft/timeline';
import { createMediaDecoder } from './media-decoder.js';
import { createCompositor, type CompositorType } from './compositor.js';
import { createFrameRenderer } from './frame-renderer.js';
import { createMasterClock } from './master-clock.js';
import { createAudioScheduler } from './audio-scheduler.js';

export interface PlaybackEngineOptions {
  compositorType?: CompositorType;
  /** Max time a single frame decode may block before the loop skips it. Default 1000ms. */
  decodeTimeoutMs?: number;
  /**
   * Optional rasterizer for subtitle-track clips. When provided, active
   * subtitle clips are composited on top of the video layers — the same code
   * path used for export, so preview and export stay in lockstep. When
   * omitted, subtitle tracks render nothing (legacy behavior).
   */
  subtitleRenderer?: SubtitleRenderer;
  /**
   * Render preview frames (planning-layer visuals attached to time points
   * on a track) when no real clip covers the current time. Defaults to
   * `true` for the playback engine — the user scrubbing the timeline
   * should see the agent's planned vibe before any real video clips land.
   */
  includePreviewFrames?: boolean;
}

/** Default per-frame decode timeout. Decodes exceeding this are logged and skipped. */
const DEFAULT_DECODE_TIMEOUT_MS = 1000;

/** Enables verbose rAF-loop logs for debugging playback stalls. */
const DEBUG_LOOP = typeof globalThis !== 'undefined'
  && (globalThis as { __PNEUMA_CRAFT_PLAYBACK_DEBUG__?: boolean }).__PNEUMA_CRAFT_PLAYBACK_DEBUG__ === true;

export function createPlaybackEngine(options?: PlaybackEngineOptions): PlaybackEngine {
  const compositorType = options?.compositorType ?? 'canvas2d';
  const decodeTimeoutMs = options?.decodeTimeoutMs ?? DEFAULT_DECODE_TIMEOUT_MS;
  const subtitleRenderer = options?.subtitleRenderer;
  const includePreviewFrames = options?.includePreviewFrames ?? true;

  let _state: PlaybackState = 'idle';
  let _playbackRate = 1;
  let _loop: { start: number; end: number } | null = null;

  // Subsystems (created on load)
  let _decoder: MediaDecoder | null = null;
  let _compositor: Compositor | null = null;
  let _frameRenderer: FrameRenderer | null = null;
  let _clock: MasterClock | null = null;
  let _audioScheduler: AudioScheduler | null = null;
  let _audioContext: AudioContext | null = null;
  let _composition: Composition | null = null;

  // rAF handle
  let _rafId: number | null = null;

  // True while a frame decode is awaiting — prevents stacking concurrent renders
  // when one decode runs slower than a rAF tick.
  let _frameInFlight = false;

  // Seek ID counter for discarding stale paused-seek renders
  let _seekId = 0;

  // Subscribers
  const stateChangeListeners = new Set<(state: PlaybackState) => void>();
  const timeUpdateListeners = new Set<(time: number) => void>();
  const frameRenderedListeners = new Set<(frame: RenderedFrame) => void>();

  function setState(newState: PlaybackState): void {
    if (_state === newState) return;
    _state = newState;
    for (const cb of stateChangeListeners) {
      try { cb(newState); } catch (e) { console.error('[PlaybackEngine] listener error:', e); }
    }
  }

  function emitTimeUpdate(time: number): void {
    for (const cb of timeUpdateListeners) {
      try { cb(time); } catch (e) { console.error('[PlaybackEngine] listener error:', e); }
    }
  }

  function emitFrameRendered(frame: RenderedFrame): void {
    for (const cb of frameRenderedListeners) {
      try { cb(frame); } catch (e) { console.error('[PlaybackEngine] listener error:', e); }
    }
  }

  function destroySubsystems(): void {
    if (_rafId !== null) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    _frameInFlight = false;
    _frameRenderer?.destroy();
    _clock?.destroy();
    _audioScheduler?.destroy();
    _audioContext?.close();
    _decoder = null;
    _compositor = null;
    _frameRenderer = null;
    _clock = null;
    _audioScheduler = null;
    _audioContext = null;
    _composition = null;
  }

  function startRafLoop(): void {
    if (_rafId !== null) return;

    // The loop is designed so that time updates and rAF scheduling are INDEPENDENT
    // of frame decoding. This means:
    //   1. If a decode hangs or is slow, the clock/slider still advances and pause/seek
    //      remain responsive.
    //   2. At most one decode runs at a time (no concurrent pile-up).
    //   3. A decode exceeding `decodeTimeoutMs` is logged and skipped so the loop can
    //      recover from a stuck codec packet pump.
    let lastLoggedState: 'render' | 'skip-inflight' | null = null;
    const logStateChange = (state: 'render' | 'skip-inflight', time: number, extra?: string): void => {
      if (!DEBUG_LOOP) return;
      if (lastLoggedState === state) return;
      lastLoggedState = state;
      console.log(`[engine] ${state} @ t=${time.toFixed(3)}${extra ? ' ' + extra : ''}`);
    };

    const loop = (): void => {
      _rafId = null;
      if (_state !== 'playing' || !_clock || !_frameRenderer || !_composition) return;

      const time = _clock.currentTime;

      // Emit time update up-front — consumers see the clock tick regardless of decode state.
      emitTimeUpdate(time);

      // End-of-timeline check.
      if (!_clock.loop && time >= _composition.duration) {
        engine.pause();
        return;
      }

      // Always schedule the next rAF synchronously so timing is decoupled from decode.
      _rafId = requestAnimationFrame(loop);

      // Skip this tick's render if the previous decode is still in flight — back-pressure
      // so slow decodes don't stack concurrent calls. The watchdog below recovers if a
      // decode never resolves; we never get stuck.
      //
      // NOTE: we intentionally do NOT skip based on _clock.driftMs. A prior implementation
      // did, which caused a deadlock: when the first decode ran long (e.g., cold-start
      // fetch of a 50 MB blob), reportVideoTime captured a large stale-drift value, then
      // every subsequent tick skipped on drift, so reportVideoTime never ran again, and
      // drift was frozen at the stale value forever. The clock is the source of truth;
      // each render just targets its current value, which naturally catches up.
      if (_frameInFlight) {
        logStateChange('skip-inflight', time);
        return;
      }

      logStateChange('render', time);

      // Kick off the decode. A watchdog timer clears _frameInFlight so the loop can
      // recover if renderFrame never resolves. We attach .then directly (no Promise.race)
      // to preserve the microtask profile — emitFrameRendered fires on the same tick
      // that renderFrame resolves.
      _frameInFlight = true;
      const clockRef = _clock;
      const compositionRef = _composition;
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        _frameInFlight = false;
        console.warn(
          `[PlaybackEngine] decode timeout at t=${time.toFixed(3)}s (>${decodeTimeoutMs}ms) — skipping frame`,
        );
      }, decodeTimeoutMs);

      _frameRenderer.renderFrame(compositionRef, time).then(frame => {
        clearTimeout(timeoutId);
        if (timedOut) return;
        _frameInFlight = false;
        if (_state !== 'playing' || _clock !== clockRef) return;
        clockRef.reportVideoTime(time);
        emitFrameRendered(frame);
      }).catch(err => {
        clearTimeout(timeoutId);
        if (timedOut) return;
        _frameInFlight = false;
        console.error('[PlaybackEngine] render error:', err);
      });
    };

    _rafId = requestAnimationFrame(loop);
  }

  function stopRafLoop(): void {
    if (_rafId !== null) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    _frameInFlight = false;
  }

  const engine: PlaybackEngine = {
    get state() { return _state; },

    get currentTime() {
      return _clock?.currentTime ?? 0;
    },

    get playbackRate() {
      return _clock?.playbackRate ?? _playbackRate;
    },
    set playbackRate(rate: number) {
      _playbackRate = rate;
      if (_clock) {
        _clock.playbackRate = rate;
      }
      if (_audioScheduler) {
        _audioScheduler.setPlaybackRate(rate);
      }
    },

    get loop() {
      return _clock?.loop ?? _loop;
    },
    set loop(l: { start: number; end: number } | null) {
      _loop = l;
      if (_clock) {
        _clock.loop = l;
      }
    },

    async load(composition: Composition, resolver: AssetResolver): Promise<void> {
      // Invalidate any pending paused-seek renders from previous session
      _seekId++;

      // If previously loaded, destroy old subsystems
      if (_state !== 'idle') {
        destroySubsystems();
      }

      setState('loading');

      try {
        // Create AudioContext
        _audioContext = new AudioContext();

        // Create subsystems
        _decoder = createMediaDecoder(resolver, _audioContext);
        _compositor = await createCompositor(
          composition.settings.width,
          composition.settings.height,
          compositorType,
        );
        _frameRenderer = createFrameRenderer(
          _decoder,
          _compositor,
          composition.settings.width,
          composition.settings.height,
          { subtitleRenderer, includePreviewFrames },
        );
        _clock = createMasterClock({
          audioContext: _audioContext,
          duration: composition.duration,
          frameRate: composition.settings.fps,
        });
        _audioScheduler = createAudioScheduler({ audioContext: _audioContext });

        // Apply pending settings
        _clock.playbackRate = _playbackRate;
        _clock.loop = _loop;

        _composition = composition;

        // Pre-load audio buffers from every clip on every audio OR video track.
        // Video clips carry their own embedded audio (MediaDecoder.decodeAudio
        // extracts it from the container), so they participate in the audio
        // graph just like standalone audio clips. Clips with no audio stream
        // (images, silent videos) throw — we swallow and skip so they simply
        // have no buffer loaded, which makes scheduleClip a no-op for them.
        const mediaClips = composition.tracks
          .filter(track => track.type === 'audio' || track.type === 'video')
          .flatMap(track => track.clips);

        for (const clip of mediaClips) {
          try {
            const audioBuffer = await _decoder.decodeAudio(clip.assetId);
            _audioScheduler.loadClip(clip.id, audioBuffer);
          } catch {
            // Clip has no audio (image asset, silent video, or decode failure).
            // Leave the clip without a buffer; audio-scheduler tolerates this.
          }
        }

        setState('ready');
      } catch (err) {
        // Clean up any partially-created subsystems
        destroySubsystems();
        setState('idle');
        throw err;
      }
    },

    play(): void {
      if (!_clock || !_audioScheduler || !_composition) {
        throw new Error('Cannot play: no composition loaded. Call load() first.');
      }
      if (_state === 'playing') return;

      // AudioContext may start in 'suspended' state because it was created
      // inside engine.load() after awaits, losing the user-gesture chain.
      // resume() works as long as ANY user gesture has occurred on the page —
      // clicking the play button is sufficient. Fire-and-forget: audio will
      // unmute as soon as resume settles, which in practice is <1 frame.
      if (_audioContext && _audioContext.state === 'suspended') {
        _audioContext.resume().catch((err) => {
          console.warn('[PlaybackEngine] AudioContext resume failed:', err);
        });
      }

      _clock.play();
      _audioScheduler.setPlaybackRate(_playbackRate);
      const clockRef = _clock;
      _audioScheduler.play(_clock.currentTime, _composition, () => clockRef.currentTime);
      setState('playing');
      startRafLoop();
    },

    pause(): void {
      if (_state !== 'playing') return;

      stopRafLoop();
      _clock?.pause();
      _audioScheduler?.pause();
      setState('paused');
    },

    seek(time: number): void {
      if (!_clock || !_audioScheduler || !_composition) {
        throw new Error('Cannot seek: no composition loaded. Call load() first.');
      }

      _clock.seek(time);
      // Use the clamped time from clock so audio/video stay in sync
      const clampedTime = _clock.currentTime;

      // Only reschedule audio when playing — seeking while paused should not produce sound
      if (_state === 'playing') {
        _audioScheduler.setPlaybackRate(_playbackRate);
        _audioScheduler.seek(clampedTime, _composition);
      }

      // If not playing, render the frame at the seeked position
      if (_state !== 'playing' && _frameRenderer) {
        const thisSeekId = ++_seekId;
        _frameRenderer.renderFrame(_composition, clampedTime).then(frame => {
          if (thisSeekId !== _seekId) return; // Stale render, discard
          emitFrameRendered(frame);
          emitTimeUpdate(clampedTime);
        }).catch(err => {
          console.error('[PlaybackEngine] seek render error:', err);
        });
      }
    },

    onStateChange(cb: (state: PlaybackState) => void): () => void {
      stateChangeListeners.add(cb);
      return () => { stateChangeListeners.delete(cb); };
    },

    onTimeUpdate(cb: (time: number) => void): () => void {
      timeUpdateListeners.add(cb);
      return () => { timeUpdateListeners.delete(cb); };
    },

    onFrameRendered(cb: (frame: RenderedFrame) => void): () => void {
      frameRenderedListeners.add(cb);
      return () => { frameRenderedListeners.delete(cb); };
    },

    destroy(): void {
      stopRafLoop();
      destroySubsystems();
      stateChangeListeners.clear();
      timeUpdateListeners.clear();
      frameRenderedListeners.clear();
      _playbackRate = 1;
      _loop = null;
      _state = 'idle';
    },
  };

  return engine;
}
