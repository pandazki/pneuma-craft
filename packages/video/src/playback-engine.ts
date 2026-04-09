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
} from './types.js';
import type { Composition } from '@pneuma-craft/timeline';
import { createMediaDecoder } from './media-decoder.js';
import { createCompositor, type CompositorType } from './compositor.js';
import { createFrameRenderer } from './frame-renderer.js';
import { createMasterClock } from './master-clock.js';
import { createAudioScheduler } from './audio-scheduler.js';

export interface PlaybackEngineOptions {
  compositorType?: CompositorType;
}

export function createPlaybackEngine(options?: PlaybackEngineOptions): PlaybackEngine {
  const compositorType = options?.compositorType ?? 'canvas2d';

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

    const loop = (): void => {
      if (_state !== 'playing' || !_clock || !_frameRenderer || !_composition) return;

      const time = _clock.currentTime;
      const driftMs = _clock.driftMs;
      const frameDuration = 1 / (_composition.settings.fps || 30);

      // Skip frame rendering if audio is too far ahead (drift compensation)
      if (driftMs > frameDuration * 1000) {
        _rafId = requestAnimationFrame(loop);
        return;
      }

      _frameRenderer.renderFrame(_composition, time).then(frame => {
        if (_state !== 'playing' || !_clock) return;

        _clock.reportVideoTime(time);
        emitFrameRendered(frame);
        emitTimeUpdate(time);

        // Check for end of timeline
        if (!_clock.loop && _composition && time >= _composition.duration) {
          engine.pause();
          return;
        }

        _rafId = requestAnimationFrame(loop);
      }).catch(err => {
        console.error('[PlaybackEngine] render error:', err);
        _rafId = requestAnimationFrame(loop);
      });
    };

    _rafId = requestAnimationFrame(loop);
  }

  function stopRafLoop(): void {
    if (_rafId !== null) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
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
      // If previously loaded, destroy old subsystems
      if (_state !== 'idle') {
        destroySubsystems();
      }

      setState('loading');

      // Create AudioContext
      _audioContext = new AudioContext();

      // Create subsystems
      _decoder = createMediaDecoder(resolver);
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

      // Pre-load audio for audio track clips
      const audioClips = composition.tracks
        .filter(track => track.type === 'audio')
        .flatMap(track => track.clips);

      for (const clip of audioClips) {
        const audioBuffer = await _decoder.decodeAudio(clip.assetId);
        _audioScheduler.loadClip(clip.id, audioBuffer);
      }

      setState('ready');
    },

    play(): void {
      if (!_clock || !_audioScheduler || !_composition) {
        throw new Error('Cannot play: no composition loaded. Call load() first.');
      }
      if (_state === 'playing') return;

      _clock.play();
      _audioScheduler.play(_clock.currentTime, _composition);
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
      _audioScheduler.seek(time, _composition);

      // If not playing, render the frame at the seeked position
      if (_state !== 'playing' && _frameRenderer) {
        _frameRenderer.renderFrame(_composition, time).then(frame => {
          emitFrameRendered(frame);
          emitTimeUpdate(time);
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
