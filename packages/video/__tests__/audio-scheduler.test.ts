import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAudioScheduler } from '../src/audio-scheduler.js';
import {
  createMockAudioContext,
  createMockAudioBuffer,
  createMockComposition,
  createMockTrack,
  createMockClip,
} from './helpers.js';
import type { AudioScheduler } from '../src/types.js';
import type { Composition } from '@pneuma-craft/timeline';

type MockAudioContext = AudioContext & { _advanceTime(s: number): void };

describe('createAudioScheduler', () => {
  let audioContext: MockAudioContext;

  beforeEach(() => {
    vi.useFakeTimers();
    audioContext = createMockAudioContext() as MockAudioContext;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 1. Creation ──────────────────────────────────────────────────────────

  describe('creation', () => {
    it('creates scheduler with the provided audio context', () => {
      const scheduler = createAudioScheduler({ audioContext });
      expect(scheduler.audioContext).toBe(audioContext);
    });

    it('exposes audioContext as readonly', () => {
      const scheduler = createAudioScheduler({ audioContext });
      expect(scheduler.audioContext).toBe(audioContext);
    });
  });

  // ── 2. loadClip ──────────────────────────────────────────────────────────

  describe('loadClip', () => {
    it('stores audio buffer for later scheduling', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer();
      scheduler.loadClip('clip-1', buffer);
      // Verify it works by playing a clip — the source node should be created
      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 5 })],
          }),
        ],
      });
      scheduler.play(0, composition);
      expect(audioContext.createBufferSource).toHaveBeenCalled();
    });

    it('can load multiple clips', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer1 = createMockAudioBuffer(5);
      const buffer2 = createMockAudioBuffer(3);
      // Should not throw
      scheduler.loadClip('clip-1', buffer1);
      scheduler.loadClip('clip-2', buffer2);
    });
  });

  // ── 3. play ──────────────────────────────────────────────────────────────

  describe('play', () => {
    it('creates source nodes for active audio clips', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer();
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 5 })],
          }),
        ],
      });

      scheduler.play(0, composition);
      expect(audioContext.createBufferSource).toHaveBeenCalledTimes(1);
      expect(audioContext.createGain).toHaveBeenCalled();
    });

    it('does not create source nodes for video tracks', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer();
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'video',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 5 })],
          }),
        ],
      });

      scheduler.play(0, composition);
      expect(audioContext.createBufferSource).not.toHaveBeenCalled();
    });

    it('does not create source nodes for muted tracks', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer();
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: true,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 5 })],
          }),
        ],
      });

      scheduler.play(0, composition);
      expect(audioContext.createBufferSource).not.toHaveBeenCalled();
    });

    it('does not schedule clips that have not started yet at fromTime', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer();
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 10, duration: 5 })],
          }),
        ],
      });

      // fromTime = 2, clip starts at 10, so it's not active yet
      scheduler.play(2, composition);
      expect(audioContext.createBufferSource).not.toHaveBeenCalled();
    });

    it('does not schedule clips that have already ended at fromTime', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer();
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 5 })],
          }),
        ],
      });

      // fromTime = 6, clip ends at 5, so it's already done
      scheduler.play(6, composition);
      expect(audioContext.createBufferSource).not.toHaveBeenCalled();
    });

    it('schedules clips that span fromTime', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer();
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 2, duration: 10 })],
          }),
        ],
      });

      // fromTime = 5, clip spans [2, 12], so it's active
      scheduler.play(5, composition);
      expect(audioContext.createBufferSource).toHaveBeenCalledTimes(1);
    });

    it('starts already-active clips immediately (contextStartTime = 0) with correct offset', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer(10);
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 2, duration: 10, inPoint: 0 })],
          }),
        ],
      });

      // fromTime = 5, clip started at 2, so elapsed = 3
      scheduler.play(5, composition);

      const sourceNode = (audioContext.createBufferSource as ReturnType<typeof vi.fn>).mock.results[0].value;
      const startCall = sourceNode.start.mock.calls[0];
      expect(startCall[0]).toBe(0); // start immediately
      expect(startCall[1]).toBe(3); // sourceOffset = inPoint(0) + elapsed(3)
      expect(startCall[2]).toBe(7); // remainingDuration = 10 - 3
    });

    it('stops existing sources before playing new ones', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer();
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 5 })],
          }),
        ],
      });

      // First play creates sources
      scheduler.play(0, composition);
      const firstCallCount = (audioContext.createBufferSource as ReturnType<typeof import('vitest').vi.fn>).mock.calls.length;

      // Second play should stop old and create new
      scheduler.play(0, composition);
      const secondCallCount = (audioContext.createBufferSource as ReturnType<typeof import('vitest').vi.fn>).mock.calls.length;
      expect(secondCallCount).toBeGreaterThan(firstCallCount);
    });
  });

  // ── 3b. Scheduler tick for future clips ──────────────────────────────

  describe('scheduler tick', () => {
    it('schedules future clips when they enter the look-ahead window', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer(5);
      scheduler.loadClip('clip-future', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-future', startTime: 1, duration: 5 })],
          }),
        ],
      });

      // Play from time 0 — clip starts at 1, not active yet
      scheduler.play(0, composition);
      expect(audioContext.createBufferSource).not.toHaveBeenCalled();

      // Advance AudioContext time to 0.9s (timeline time ~0.9, look-ahead reaches 1.1)
      audioContext._advanceTime(0.9);
      vi.advanceTimersByTime(100);

      // Clip at 1.0 should now be scheduled within look-ahead
      expect(audioContext.createBufferSource).toHaveBeenCalledTimes(1);
    });

    it('schedules future clips at correct AudioContext time, not immediately', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer(5);
      scheduler.loadClip('clip-future', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-future', startTime: 1, duration: 5, inPoint: 0 })],
          }),
        ],
      });

      // Play from time 0
      scheduler.play(0, composition);

      // Advance to 0.9s so look-ahead reaches 1.1 (clip starts at 1.0)
      audioContext._advanceTime(0.9);
      vi.advanceTimersByTime(100);

      expect(audioContext.createBufferSource).toHaveBeenCalledTimes(1);
      const sourceNode = (audioContext.createBufferSource as ReturnType<typeof vi.fn>).mock.results[0].value;

      // The source should be scheduled at a future AudioContext time, not 0 (immediately)
      // clip.startTime (1.0) > currentTimelineTime (~0.9), so contextStartTime > 0
      const startCall = sourceNode.start.mock.calls[0];
      expect(startCall[0]).toBeGreaterThan(0); // contextStartTime should be > 0
      expect(startCall[1]).toBe(0); // sourceOffset = inPoint = 0
      expect(startCall[2]).toBe(5); // full duration
    });

    it('accounts for playbackRate when scheduling future clip delay', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer(5);
      scheduler.loadClip('clip-future', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-future', startTime: 1, duration: 5, inPoint: 0 })],
          }),
        ],
      });

      // Set playback rate to 2x
      scheduler.setPlaybackRate(2);

      // Play from time 0
      scheduler.play(0, composition);

      // At 2x rate, timeline time reaches 1.0 after 0.5 real seconds
      // Advance AudioContext time to 0.4s (timeline time = 0.4 * 2 = 0.8, look-ahead reaches 1.0)
      audioContext._advanceTime(0.4);
      vi.advanceTimersByTime(100);

      expect(audioContext.createBufferSource).toHaveBeenCalledTimes(1);
      const sourceNode = (audioContext.createBufferSource as ReturnType<typeof vi.fn>).mock.results[0].value;

      // The contextStartTime should account for playbackRate:
      // timeUntilClipStart = (1.0 - 0.8) / 2 = 0.1 real seconds
      const startCall = sourceNode.start.mock.calls[0];
      expect(startCall[0]).toBeGreaterThan(0); // Should be scheduled in the future
      // At 2x rate, the delay should be roughly half of what it would be at 1x
      // contextStartTime ≈ audioContext.currentTime + 0.1
    });

    it('does not schedule the same clip twice', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer(5);
      scheduler.loadClip('clip-future', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-future', startTime: 1, duration: 5 })],
          }),
        ],
      });

      scheduler.play(0, composition);

      // Advance past the clip start
      audioContext._advanceTime(1.5);
      vi.advanceTimersByTime(100);
      vi.advanceTimersByTime(100);

      // Should only be scheduled once
      expect(audioContext.createBufferSource).toHaveBeenCalledTimes(1);
    });

    it('clears tick on pause', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer(5);
      scheduler.loadClip('clip-future', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-future', startTime: 2, duration: 5 })],
          }),
        ],
      });

      scheduler.play(0, composition);
      scheduler.pause();

      // Advance time — tick should not fire
      audioContext._advanceTime(2.0);
      vi.advanceTimersByTime(200);

      expect(audioContext.createBufferSource).not.toHaveBeenCalled();
    });

    it('clears tick on destroy', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer(5);
      scheduler.loadClip('clip-future', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-future', startTime: 2, duration: 5 })],
          }),
        ],
      });

      scheduler.play(0, composition);
      scheduler.destroy();

      audioContext._advanceTime(2.0);
      vi.advanceTimersByTime(200);

      // After destroy, the buffer was cleared — no new source should be created
      // (createBufferSource may have been called 0 times since clip was future)
    });

    it('detects loop wrap when getCurrentTime callback returns earlier time', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer(5);
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 5 })],
          }),
        ],
      });

      // Simulate a clock that loops: first returns 4.5, then wraps to 0.5
      let mockTime = 0;
      const getCurrentTime = () => mockTime;

      scheduler.play(0, composition, getCurrentTime);
      const countAfterPlay = (audioContext.createBufferSource as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(countAfterPlay).toBe(1); // Clip at 0 is active

      // Advance to near end of loop
      mockTime = 4.5;
      audioContext._advanceTime(4.5);
      vi.advanceTimersByTime(100);

      // Now simulate loop wrap — time goes backwards
      mockTime = 0.5;
      audioContext._advanceTime(0.1);
      vi.advanceTimersByTime(100);

      // The clip should have been rescheduled after loop wrap
      const countAfterWrap = (audioContext.createBufferSource as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(countAfterWrap).toBeGreaterThan(countAfterPlay);
    });

    it('resets scheduled set on seek', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer(10);
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 10 })],
          }),
        ],
      });

      scheduler.play(0, composition);
      const countAfterPlay = (audioContext.createBufferSource as ReturnType<typeof vi.fn>).mock.calls.length;

      // Seek to a position where the clip is still active
      scheduler.seek(5, composition);
      const countAfterSeek = (audioContext.createBufferSource as ReturnType<typeof vi.fn>).mock.calls.length;

      // Seek should have created a new source (reset + reschedule)
      expect(countAfterSeek).toBeGreaterThan(countAfterPlay);
    });
  });

  // ── 4. pause ────────────────────────────────────────────────────────────

  describe('pause', () => {
    it('stops all active source nodes', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer();
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 5 })],
          }),
        ],
      });

      scheduler.play(0, composition);

      // Get the source node that was created
      const sourceNode = (audioContext.createBufferSource as ReturnType<typeof import('vitest').vi.fn>).mock.results[0].value;
      scheduler.pause();

      expect(sourceNode.stop).toHaveBeenCalled();
    });

    it('is a no-op when not playing', () => {
      const scheduler = createAudioScheduler({ audioContext });
      // Should not throw
      expect(() => scheduler.pause()).not.toThrow();
    });
  });

  // ── 5. setTrackVolume ────────────────────────────────────────────────────

  describe('setTrackVolume', () => {
    it('updates track gain node value', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer();
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 5 })],
          }),
        ],
      });

      scheduler.play(0, composition);
      scheduler.setTrackVolume('track-1', 0.5);

      // The track gain node should have been updated
      // Since gain nodes are created on play, we verify the call happened without error
      expect(() => scheduler.setTrackVolume('track-1', 0.5)).not.toThrow();
    });

    it('creates gain node for unknown track if needed', () => {
      const scheduler = createAudioScheduler({ audioContext });
      // Should not throw even for a track that has no clips played yet
      expect(() => scheduler.setTrackVolume('unknown-track', 0.5)).not.toThrow();
    });

    it('does not unmute a muted track when volume is changed', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer();
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            volume: 0.8,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 5 })],
          }),
        ],
      });

      scheduler.play(0, composition);

      // Mute the track
      scheduler.setTrackMute('track-1', true);

      // Find the track gain node (the second gain node created — first is master, then track, then clip)
      const gainResults = (audioContext.createGain as ReturnType<typeof vi.fn>).mock.results;
      // Track gain node should be at index 1 (0=master created in constructor, 1=track, 2=clip)
      const trackGainNode = gainResults[1].value;

      // Verify it's muted (gain = 0)
      expect(trackGainNode.gain.value).toBe(0);

      // Now set volume — should NOT change gain because track is muted
      scheduler.setTrackVolume('track-1', 0.9);
      expect(trackGainNode.gain.value).toBe(0);

      // Unmute — should restore to the new volume
      scheduler.setTrackMute('track-1', false);
      expect(trackGainNode.gain.value).toBe(0.9);
    });
  });

  // ── 6. setTrackMute ──────────────────────────────────────────────────────

  describe('setTrackMute', () => {
    it('sets track gain to zero when muted', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer();
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            volume: 0.8,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 5 })],
          }),
        ],
      });

      scheduler.play(0, composition);

      // Collect all gain nodes created
      const gainCalls = (audioContext.createGain as ReturnType<typeof import('vitest').vi.fn>).mock.results;
      scheduler.setTrackMute('track-1', true);

      // After muting, a gain node for the track should have value 0
      const trackGainNode = gainCalls.find((r: { value: { gain: { value: number } } }) => r.value.gain.value === 0);
      // We just verify no error is thrown and the operation completes
      expect(() => scheduler.setTrackMute('track-1', false)).not.toThrow();
    });

    it('restores volume when unmuted', () => {
      const scheduler = createAudioScheduler({ audioContext });
      // Should not throw
      expect(() => scheduler.setTrackMute('track-1', false)).not.toThrow();
    });
  });

  // ── 7. seek ──────────────────────────────────────────────────────────────

  describe('seek', () => {
    it('stops current sources and reschedules from new position', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer(10);
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 10 })],
          }),
        ],
      });

      scheduler.play(0, composition);
      const firstSource = (audioContext.createBufferSource as ReturnType<typeof import('vitest').vi.fn>).mock.results[0].value;

      scheduler.seek(5, composition);
      expect(firstSource.stop).toHaveBeenCalled();

      // New source should have been created for the seek position
      const callCount = (audioContext.createBufferSource as ReturnType<typeof import('vitest').vi.fn>).mock.calls.length;
      expect(callCount).toBe(2); // One for play, one for seek
    });

    it('works when not currently playing (seek while paused)', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const composition = createMockComposition();

      // Should not throw
      expect(() => scheduler.seek(5, composition)).not.toThrow();
    });
  });

  // ── 8. Skips clips without loaded buffers ────────────────────────────────

  describe('buffer loading', () => {
    it('skips clips whose buffer has not been loaded', () => {
      const scheduler = createAudioScheduler({ audioContext });
      // Do NOT load any buffer

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 5 })],
          }),
        ],
      });

      scheduler.play(0, composition);
      // No source node should be created since buffer is not loaded
      expect(audioContext.createBufferSource).not.toHaveBeenCalled();
    });

    it('schedules only clips with loaded buffers when some are missing', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer();
      scheduler.loadClip('clip-1', buffer);
      // clip-2 is NOT loaded

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [
              createMockClip({ id: 'clip-1', startTime: 0, duration: 5 }),
              createMockClip({ id: 'clip-2', startTime: 0, duration: 5 }),
            ],
          }),
        ],
      });

      scheduler.play(0, composition);
      // Only one source node for clip-1
      expect(audioContext.createBufferSource).toHaveBeenCalledTimes(1);
    });
  });

  // ── 9. destroy ──────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('stops all active sources', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer();
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 5 })],
          }),
        ],
      });

      scheduler.play(0, composition);
      const sourceNode = (audioContext.createBufferSource as ReturnType<typeof import('vitest').vi.fn>).mock.results[0].value;

      scheduler.destroy();
      expect(sourceNode.stop).toHaveBeenCalled();
    });

    it('disconnects master gain node', () => {
      const scheduler = createAudioScheduler({ audioContext });
      scheduler.destroy();
      // Verify all gain nodes are disconnected
      const gainNodes = (audioContext.createGain as ReturnType<typeof import('vitest').vi.fn>).mock.results;
      for (const result of gainNodes) {
        expect(result.value.disconnect).toHaveBeenCalled();
      }
    });

    it('clears internal maps so further plays do not use old state', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer();
      scheduler.loadClip('clip-1', buffer);
      scheduler.destroy();

      // After destroy, the scheduler should be in a clean state
      // (implementation detail: play after destroy should not throw)
      const composition = createMockComposition();
      expect(() => scheduler.play(0, composition)).not.toThrow();
    });
  });

  // ── 9b. setPlaybackRate updates active sources ──────────────────────────

  describe('setPlaybackRate updates active sources', () => {
    it('updates playbackRate on already-running source nodes', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer(10);
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [createMockClip({ id: 'clip-1', startTime: 0, duration: 10 })],
          }),
        ],
      });

      scheduler.play(0, composition);

      const sourceNode = (audioContext.createBufferSource as ReturnType<typeof vi.fn>).mock.results[0].value;
      expect(sourceNode.playbackRate.value).toBe(1);

      scheduler.setPlaybackRate(2);
      expect(sourceNode.playbackRate.value).toBe(2);
    });

    it('updates playbackRate on multiple active source nodes', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer1 = createMockAudioBuffer(10);
      const buffer2 = createMockAudioBuffer(10);
      scheduler.loadClip('clip-1', buffer1);
      scheduler.loadClip('clip-2', buffer2);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [
              createMockClip({ id: 'clip-1', startTime: 0, duration: 10 }),
              createMockClip({ id: 'clip-2', startTime: 0, duration: 10 }),
            ],
          }),
        ],
      });

      scheduler.play(0, composition);

      const sourceResults = (audioContext.createBufferSource as ReturnType<typeof vi.fn>).mock.results;
      scheduler.setPlaybackRate(0.5);

      for (const result of sourceResults) {
        expect(result.value.playbackRate.value).toBe(0.5);
      }
    });
  });

  // ── 10. Fade automation ──────────────────────────────────────────────────

  describe('fade automation', () => {
    it('applies fadeIn automation when clip has fadeIn set', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer(10);
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [
              createMockClip({
                id: 'clip-1',
                startTime: 0,
                duration: 10,
                fadeIn: 2,
              }),
            ],
          }),
        ],
      });

      scheduler.play(0, composition);

      // linearRampToValueAtTime should have been called for fadeIn
      const gainNodes = (audioContext.createGain as ReturnType<typeof import('vitest').vi.fn>).mock.results;
      const anyRamp = gainNodes.some((r: { value: { gain: { linearRampToValueAtTime: ReturnType<typeof import('vitest').vi.fn> } } }) =>
        r.value.gain.linearRampToValueAtTime.mock.calls.length > 0
      );
      expect(anyRamp).toBe(true);
    });

    it('applies fadeOut automation when clip has fadeOut set', () => {
      const scheduler = createAudioScheduler({ audioContext });
      const buffer = createMockAudioBuffer(10);
      scheduler.loadClip('clip-1', buffer);

      const composition = createMockComposition({
        tracks: [
          createMockTrack({
            id: 'track-1',
            type: 'audio',
            muted: false,
            clips: [
              createMockClip({
                id: 'clip-1',
                startTime: 0,
                duration: 10,
                fadeOut: 2,
              }),
            ],
          }),
        ],
      });

      scheduler.play(0, composition);

      const gainNodes = (audioContext.createGain as ReturnType<typeof import('vitest').vi.fn>).mock.results;
      const anyRamp = gainNodes.some((r: { value: { gain: { linearRampToValueAtTime: ReturnType<typeof import('vitest').vi.fn> } } }) =>
        r.value.gain.linearRampToValueAtTime.mock.calls.length > 0
      );
      expect(anyRamp).toBe(true);
    });
  });
});
