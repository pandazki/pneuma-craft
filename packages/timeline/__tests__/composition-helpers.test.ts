import { describe, it, expect } from 'vitest';
import {
  computeDuration,
  recomputeDuration,
  addClipToTrack,
  removeClipFromComposition,
  updateClipInComposition,
  findClipById,
  findTrackByClipId,
} from '../src/composition-helpers.js';
import { createMockComposition, createMockTrack, createMockClip } from './helpers.js';

describe('computeDuration', () => {
  it('returns 0 for empty composition', () => {
    expect(computeDuration(createMockComposition())).toBe(0);
  });

  it('returns max clip end time', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({
        clips: [
          createMockClip({ startTime: 0, duration: 5 }),
          createMockClip({ id: 'c2', startTime: 10, duration: 3 }),
        ],
      })],
    });
    expect(computeDuration(comp)).toBe(13);
  });

  it('considers all tracks', () => {
    const comp = createMockComposition({
      tracks: [
        createMockTrack({ id: 't1', clips: [createMockClip({ startTime: 0, duration: 5 })] }),
        createMockTrack({ id: 't2', clips: [createMockClip({ id: 'c2', trackId: 't2', startTime: 10, duration: 10 })] }),
      ],
    });
    expect(computeDuration(comp)).toBe(20);
  });
});

describe('recomputeDuration', () => {
  it('returns composition with updated duration', () => {
    const comp = createMockComposition({
      duration: 999,
      tracks: [createMockTrack({ clips: [createMockClip({ startTime: 0, duration: 7 })] })],
    });
    const updated = recomputeDuration(comp);
    expect(updated.duration).toBe(7);
    expect(updated).not.toBe(comp);
  });
});

describe('addClipToTrack', () => {
  it('adds clip and sorts by startTime', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({
        clips: [
          createMockClip({ id: 'c1', startTime: 0, duration: 3 }),
          createMockClip({ id: 'c3', startTime: 10, duration: 5 }),
        ],
      })],
    });
    const newClip = createMockClip({ id: 'c2', startTime: 5, duration: 3 });
    const updated = addClipToTrack(comp, 'track-1', newClip);
    expect(updated.tracks[0].clips.map(c => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('throws if track not found', () => {
    expect(() => addClipToTrack(createMockComposition(), 'nope', createMockClip())).toThrow();
  });
});

describe('removeClipFromComposition', () => {
  it('removes clip from its track', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({ clips: [createMockClip({ id: 'c1' })] })],
    });
    const updated = removeClipFromComposition(comp, 'c1');
    expect(updated.tracks[0].clips).toHaveLength(0);
  });
});

describe('updateClipInComposition', () => {
  it('updates clip with updater function', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({ clips: [createMockClip({ id: 'c1', startTime: 0 })] })],
    });
    const updated = updateClipInComposition(comp, 'c1', clip => ({ ...clip, startTime: 10 }));
    expect(updated.tracks[0].clips[0].startTime).toBe(10);
  });

  it('re-sorts clips after update', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({
        clips: [
          createMockClip({ id: 'c1', startTime: 0 }),
          createMockClip({ id: 'c2', startTime: 5 }),
        ],
      })],
    });
    const updated = updateClipInComposition(comp, 'c1', clip => ({ ...clip, startTime: 10 }));
    expect(updated.tracks[0].clips.map(c => c.id)).toEqual(['c2', 'c1']);
  });
});

describe('findClipById', () => {
  it('returns clip and track', () => {
    const clip = createMockClip({ id: 'c1' });
    const track = createMockTrack({ clips: [clip] });
    const comp = createMockComposition({ tracks: [track] });
    const result = findClipById(comp, 'c1');
    expect(result).toBeDefined();
    expect(result!.clip.id).toBe('c1');
    expect(result!.track.id).toBe('track-1');
  });

  it('returns undefined for unknown clip', () => {
    expect(findClipById(createMockComposition(), 'nope')).toBeUndefined();
  });
});

describe('findTrackByClipId', () => {
  it('returns the track containing the clip', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({ clips: [createMockClip({ id: 'c1' })] })],
    });
    expect(findTrackByClipId(comp, 'c1')!.id).toBe('track-1');
  });
});
