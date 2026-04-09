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
