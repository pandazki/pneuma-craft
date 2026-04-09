import type { MasterClock, ClockState } from './types.js';

export interface MasterClockOptions {
  audioContext: AudioContext;
  duration?: number;
  frameRate?: number;
}

export function createMasterClock(options: MasterClockOptions): MasterClock {
  const audioContext = options.audioContext;

  let state: ClockState = 'stopped';
  let _duration = options.duration ?? 0;
  let _playbackRate = 1;
  let _loop: { start: number; end: number } | null = null;

  // Timing anchors
  let startAudioContextTime = 0;
  let startTimelineTime = 0;
  let pausedAt = 0;

  // Drift tracking
  let _driftMs = 0;

  // Subscribers
  const timeUpdateListeners = new Set<(time: number) => void>();
  const stateChangeListeners = new Set<(state: ClockState) => void>();

  function computeCurrentTime(): number {
    if (state !== 'playing') return pausedAt;

    const elapsed = (audioContext.currentTime - startAudioContextTime) * _playbackRate;
    let time = startTimelineTime + elapsed;

    if (_loop && _loop.end > _loop.start && time >= _loop.end) {
      const loopDuration = _loop.end - _loop.start;
      time = _loop.start + ((time - _loop.start) % loopDuration);
    }

    return Math.max(0, Math.min(time, _duration || Infinity));
  }

  function notifyTimeUpdate(time: number): void {
    for (const cb of timeUpdateListeners) {
      try { cb(time); } catch (e) { console.error('[MasterClock] listener error:', e); }
    }
  }

  function notifyStateChange(newState: ClockState): void {
    for (const cb of stateChangeListeners) {
      try { cb(newState); } catch (e) { console.error('[MasterClock] listener error:', e); }
    }
  }

  function setState(newState: ClockState): void {
    if (state === newState) return;
    state = newState;
    notifyStateChange(newState);
  }

  const clock: MasterClock = {
    get currentTime() { return computeCurrentTime(); },
    get state() { return state; },
    get driftMs() { return _driftMs; },

    get playbackRate() { return _playbackRate; },
    set playbackRate(rate: number) {
      const clamped = Math.max(0.1, Math.min(rate, 16));
      if (state === 'playing') {
        const current = computeCurrentTime();
        startTimelineTime = current;
        startAudioContextTime = audioContext.currentTime;
      }
      _playbackRate = clamped;
    },

    get duration() { return _duration; },
    set duration(d: number) { _duration = Math.max(0, d); },

    get loop() { return _loop; },
    set loop(l) { _loop = l; },

    play(): void {
      if (state === 'playing') return;
      startTimelineTime = pausedAt;
      startAudioContextTime = audioContext.currentTime;
      setState('playing');
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
    },

    pause(): void {
      if (state !== 'playing') return;
      pausedAt = computeCurrentTime();
      setState('paused');
    },

    seek(time: number): void {
      const clamped = Math.max(0, Math.min(time, _duration));
      if (state === 'playing') {
        startTimelineTime = clamped;
        startAudioContextTime = audioContext.currentTime;
      } else {
        pausedAt = clamped;
      }
      notifyTimeUpdate(clamped);
    },

    reportVideoTime(videoTime: number): void {
      const audioTime = computeCurrentTime();
      _driftMs = (audioTime - videoTime) * 1000;
    },

    onTimeUpdate(cb) {
      timeUpdateListeners.add(cb);
      return () => { timeUpdateListeners.delete(cb); };
    },

    onStateChange(cb) {
      stateChangeListeners.add(cb);
      return () => { stateChangeListeners.delete(cb); };
    },

    destroy(): void {
      if (state === 'playing') {
        pausedAt = computeCurrentTime();
      }
      state = 'stopped';
      timeUpdateListeners.clear();
      stateChangeListeners.clear();
      _driftMs = 0;
    },
  };

  return clock;
}
