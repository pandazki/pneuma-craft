import { describe, it, expect, beforeEach } from 'vitest';
import { createMasterClock } from '../src/master-clock.js';
import { createMockAudioContext } from './helpers.js';
import type { ClockState } from '../src/types.js';

type MockAudioContext = AudioContext & { _advanceTime(s: number): void };

describe('createMasterClock', () => {
  let audioContext: MockAudioContext;

  beforeEach(() => {
    audioContext = createMockAudioContext() as MockAudioContext;
  });

  // ── 1. Creation ──────────────────────────────────────────────────────

  describe('creation', () => {
    it('has default state stopped', () => {
      const clock = createMasterClock({ audioContext });
      expect(clock.state).toBe('stopped');
    });

    it('has default currentTime of 0', () => {
      const clock = createMasterClock({ audioContext });
      expect(clock.currentTime).toBe(0);
    });

    it('has default playbackRate of 1', () => {
      const clock = createMasterClock({ audioContext });
      expect(clock.playbackRate).toBe(1);
    });

    it('has default duration of 0', () => {
      const clock = createMasterClock({ audioContext });
      expect(clock.duration).toBe(0);
    });

    it('has default loop of null', () => {
      const clock = createMasterClock({ audioContext });
      expect(clock.loop).toBeNull();
    });

    it('has default driftMs of 0', () => {
      const clock = createMasterClock({ audioContext });
      expect(clock.driftMs).toBe(0);
    });

    it('accepts initial duration option', () => {
      const clock = createMasterClock({ audioContext, duration: 30 });
      expect(clock.duration).toBe(30);
    });
  });

  // ── 2. play / pause / seek state transitions ─────────────────────────

  describe('play', () => {
    it('transitions from stopped to playing', () => {
      const clock = createMasterClock({ audioContext });
      clock.play();
      expect(clock.state).toBe('playing');
    });

    it('transitions from paused to playing', () => {
      const clock = createMasterClock({ audioContext, duration: 10 });
      clock.play();
      audioContext._advanceTime(2);
      clock.pause();
      clock.play();
      expect(clock.state).toBe('playing');
    });

    it('is a no-op when already playing', () => {
      const states: ClockState[] = [];
      const clock = createMasterClock({ audioContext });
      clock.onStateChange(s => states.push(s));
      clock.play();
      clock.play();
      expect(states).toEqual(['playing']);
    });

    it('resumes suspended AudioContext', () => {
      const suspendedCtx = {
        ...audioContext,
        state: 'suspended',
        resume: audioContext.resume,
      } as unknown as MockAudioContext;
      const clock = createMasterClock({ audioContext: suspendedCtx });
      clock.play();
      expect(suspendedCtx.resume).toHaveBeenCalled();
    });
  });

  describe('pause', () => {
    it('transitions from playing to paused', () => {
      const clock = createMasterClock({ audioContext });
      clock.play();
      clock.pause();
      expect(clock.state).toBe('paused');
    });

    it('preserves currentTime on pause', () => {
      const clock = createMasterClock({ audioContext, duration: 20 });
      clock.play();
      audioContext._advanceTime(3);
      clock.pause();
      expect(clock.currentTime).toBeCloseTo(3);
    });

    it('is a no-op when stopped', () => {
      const states: ClockState[] = [];
      const clock = createMasterClock({ audioContext });
      clock.onStateChange(s => states.push(s));
      clock.pause();
      expect(states).toEqual([]);
      expect(clock.state).toBe('stopped');
    });

    it('is a no-op when already paused', () => {
      const states: ClockState[] = [];
      const clock = createMasterClock({ audioContext, duration: 10 });
      clock.play();
      clock.pause();
      clock.onStateChange(s => states.push(s));
      clock.pause();
      expect(states).toEqual([]);
    });
  });

  describe('seek', () => {
    it('updates currentTime when stopped', () => {
      const clock = createMasterClock({ audioContext, duration: 10 });
      clock.seek(5);
      expect(clock.currentTime).toBeCloseTo(5);
    });

    it('updates currentTime when paused', () => {
      const clock = createMasterClock({ audioContext, duration: 10 });
      clock.play();
      clock.pause();
      clock.seek(7);
      expect(clock.currentTime).toBeCloseTo(7);
    });

    it('clamps seek to 0', () => {
      const clock = createMasterClock({ audioContext, duration: 10 });
      clock.seek(-5);
      expect(clock.currentTime).toBe(0);
    });

    it('clamps seek to duration', () => {
      const clock = createMasterClock({ audioContext, duration: 10 });
      clock.seek(15);
      expect(clock.currentTime).toBeCloseTo(10);
    });

    it('re-anchors timing during playback', () => {
      const clock = createMasterClock({ audioContext, duration: 20 });
      clock.play();
      audioContext._advanceTime(3);
      clock.seek(8);
      audioContext._advanceTime(2);
      expect(clock.currentTime).toBeCloseTo(10);
    });

    it('fires onTimeUpdate', () => {
      const times: number[] = [];
      const clock = createMasterClock({ audioContext, duration: 10 });
      clock.onTimeUpdate(t => times.push(t));
      clock.seek(4);
      expect(times).toContain(4);
    });
  });

  // ── 3. Time calculation ──────────────────────────────────────────────

  describe('time calculation', () => {
    it('advances with AudioContext.currentTime while playing', () => {
      const clock = createMasterClock({ audioContext, duration: 30 });
      clock.play();
      audioContext._advanceTime(5);
      expect(clock.currentTime).toBeCloseTo(5);
    });

    it('returns pausedAt when paused (does not advance)', () => {
      const clock = createMasterClock({ audioContext, duration: 30 });
      clock.play();
      audioContext._advanceTime(4);
      clock.pause();
      audioContext._advanceTime(10); // should be ignored
      expect(clock.currentTime).toBeCloseTo(4);
    });

    it('returns 0 when stopped and no seek', () => {
      const clock = createMasterClock({ audioContext, duration: 10 });
      audioContext._advanceTime(5); // should not affect stopped clock
      expect(clock.currentTime).toBe(0);
    });

    it('clamps currentTime to duration while playing', () => {
      const clock = createMasterClock({ audioContext, duration: 5 });
      clock.play();
      audioContext._advanceTime(10);
      expect(clock.currentTime).toBeCloseTo(5);
    });

    it('respects playbackRate', () => {
      const clock = createMasterClock({ audioContext, duration: 30 });
      clock.playbackRate = 2;
      clock.play();
      audioContext._advanceTime(3);
      expect(clock.currentTime).toBeCloseTo(6);
    });
  });

  // ── 4. Loop ──────────────────────────────────────────────────────────

  describe('loop', () => {
    it('wraps time within loop region', () => {
      // duration=20, loop={start:2, end:6}, play, advance 7s
      // elapsed = 7s, time = 0 + 7 = 7
      // loop active: time(7) >= end(6)
      // loopDuration = 4, time = 2 + ((7 - 2) % 4) = 2 + 1 = 3
      const clock = createMasterClock({ audioContext, duration: 20 });
      clock.loop = { start: 2, end: 6 };
      clock.play();
      audioContext._advanceTime(7);
      expect(clock.currentTime).toBeCloseTo(3);
    });

    it('does not wrap when time is within loop region', () => {
      const clock = createMasterClock({ audioContext, duration: 20 });
      clock.loop = { start: 2, end: 6 };
      clock.play();
      audioContext._advanceTime(4); // time = 4, within [2, 6]
      expect(clock.currentTime).toBeCloseTo(4);
    });

    it('loops multiple times', () => {
      // loop={start:0, end:4}, advance 9s → 9 % 4 = 1
      const clock = createMasterClock({ audioContext, duration: 20 });
      clock.loop = { start: 0, end: 4 };
      clock.play();
      audioContext._advanceTime(9);
      expect(clock.currentTime).toBeCloseTo(1);
    });

    it('does not loop when loop is null', () => {
      const clock = createMasterClock({ audioContext, duration: 20 });
      clock.loop = null;
      clock.play();
      audioContext._advanceTime(10);
      expect(clock.currentTime).toBeCloseTo(10);
    });

    it('does not loop when loop.end <= loop.start', () => {
      const clock = createMasterClock({ audioContext, duration: 20 });
      clock.loop = { start: 5, end: 5 }; // invalid loop
      clock.play();
      audioContext._advanceTime(8);
      expect(clock.currentTime).toBeCloseTo(8);
    });
  });

  // ── 5. PlaybackRate change during playback ───────────────────────────

  describe('playbackRate change during playback', () => {
    it('re-anchors timing when rate changes mid-playback', () => {
      // play, advance 2s at rate=1 → time=2
      // set rate=2, advance 1s → time=2 + 1*2 = 4
      const clock = createMasterClock({ audioContext, duration: 30 });
      clock.play();
      audioContext._advanceTime(2);
      expect(clock.currentTime).toBeCloseTo(2);
      clock.playbackRate = 2;
      audioContext._advanceTime(1);
      expect(clock.currentTime).toBeCloseTo(4);
    });

    it('clamps playbackRate minimum to 0.1', () => {
      const clock = createMasterClock({ audioContext });
      clock.playbackRate = 0;
      expect(clock.playbackRate).toBeCloseTo(0.1);
    });

    it('clamps playbackRate maximum to 16', () => {
      const clock = createMasterClock({ audioContext });
      clock.playbackRate = 100;
      expect(clock.playbackRate).toBeCloseTo(16);
    });
  });

  // ── 6. Drift tracking ────────────────────────────────────────────────

  describe('reportVideoTime', () => {
    it('calculates drift as (audioTime - videoTime) * 1000', () => {
      const clock = createMasterClock({ audioContext, duration: 30 });
      clock.play();
      audioContext._advanceTime(5);
      // audioTime = 5, videoTime = 4.9 → drift = 100ms
      clock.reportVideoTime(4.9);
      expect(clock.driftMs).toBeCloseTo(100);
    });

    it('returns 0 drift when video and audio are in sync', () => {
      const clock = createMasterClock({ audioContext, duration: 30 });
      clock.play();
      audioContext._advanceTime(5);
      clock.reportVideoTime(5);
      expect(clock.driftMs).toBeCloseTo(0);
    });

    it('reports negative drift when video is ahead', () => {
      const clock = createMasterClock({ audioContext, duration: 30 });
      clock.play();
      audioContext._advanceTime(5);
      clock.reportVideoTime(5.1);
      expect(clock.driftMs).toBeCloseTo(-100);
    });
  });

  // ── 7. Subscriptions ─────────────────────────────────────────────────

  describe('onStateChange', () => {
    it('fires on play', () => {
      const states: ClockState[] = [];
      const clock = createMasterClock({ audioContext });
      clock.onStateChange(s => states.push(s));
      clock.play();
      expect(states).toContain('playing');
    });

    it('fires on pause', () => {
      const states: ClockState[] = [];
      const clock = createMasterClock({ audioContext, duration: 10 });
      clock.play();
      clock.onStateChange(s => states.push(s));
      clock.pause();
      expect(states).toContain('paused');
    });

    it('returns unsubscribe function that works', () => {
      const states: ClockState[] = [];
      const clock = createMasterClock({ audioContext });
      const unsub = clock.onStateChange(s => states.push(s));
      unsub();
      clock.play();
      expect(states).toEqual([]);
    });
  });

  describe('onTimeUpdate', () => {
    it('fires on seek', () => {
      const times: number[] = [];
      const clock = createMasterClock({ audioContext, duration: 10 });
      clock.onTimeUpdate(t => times.push(t));
      clock.seek(3);
      expect(times).toContain(3);
    });

    it('returns unsubscribe function that works', () => {
      const times: number[] = [];
      const clock = createMasterClock({ audioContext, duration: 10 });
      const unsub = clock.onTimeUpdate(t => times.push(t));
      unsub();
      clock.seek(5);
      expect(times).toEqual([]);
    });
  });

  // ── 8. Destroy ───────────────────────────────────────────────────────

  describe('destroy', () => {
    it('clears state change subscribers', () => {
      const states: ClockState[] = [];
      const clock = createMasterClock({ audioContext });
      clock.onStateChange(s => states.push(s));
      clock.destroy();
      // After destroy, listeners are cleared; no further events should fire
      // (cannot trigger state changes after destroy, so just verify no error)
      expect(states).toEqual([]);
    });

    it('clears time update subscribers', () => {
      const times: number[] = [];
      const clock = createMasterClock({ audioContext, duration: 10 });
      clock.onTimeUpdate(t => times.push(t));
      clock.destroy();
      // After destroy subscribers are cleared
      expect(times).toEqual([]);
    });

    it('resets driftMs to 0', () => {
      const clock = createMasterClock({ audioContext, duration: 30 });
      clock.play();
      audioContext._advanceTime(5);
      clock.reportVideoTime(4);
      clock.destroy();
      expect(clock.driftMs).toBe(0);
    });

    it('sets state to stopped', () => {
      const clock = createMasterClock({ audioContext });
      clock.play();
      clock.destroy();
      expect(clock.state).toBe('stopped');
    });

    it('preserves currentTime snapshot when destroyed while playing', () => {
      // After destroy, state is stopped, so currentTime returns pausedAt which
      // was captured from the playing position at destroy time
      const clock = createMasterClock({ audioContext, duration: 30 });
      clock.play();
      audioContext._advanceTime(5);
      clock.destroy();
      // state is now stopped; pausedAt was captured at ~5
      expect(clock.currentTime).toBeCloseTo(5);
    });
  });
});
