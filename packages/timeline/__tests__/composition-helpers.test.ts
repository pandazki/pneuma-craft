import { describe, it, expect } from 'vitest';
import {
  computeDuration,
  recomputeDuration,
  addClipToTrack,
  removeClipFromComposition,
  updateClipInComposition,
  findClipById,
  findTrackByClipId,
  addPreviewFrame,
  removePreviewFrameFromComposition,
  updatePreviewFrameInComposition,
  findPreviewFrameById,
  findGreatestPreviewFrameAtOrBefore,
} from '../src/composition-helpers.js';
import { createMockComposition, createMockTrack, createMockClip, createMockPreviewFrame } from './helpers.js';

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

// ── Preview Frame Helpers ──────────────────────────────────────────────

describe('computeDuration with preview frames', () => {
  it('extends duration to last preview frame time', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({
        previewFrames: [
          createMockPreviewFrame({ id: 'pf1', time: 0 }),
          createMockPreviewFrame({ id: 'pf2', time: 14 }),
        ],
      })],
    });
    expect(computeDuration(comp)).toBe(14);
  });

  it('takes the max of clip end and preview time', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({
        clips: [createMockClip({ startTime: 0, duration: 7 })],
        previewFrames: [createMockPreviewFrame({ time: 12 })],
      })],
    });
    expect(computeDuration(comp)).toBe(12);
  });

  it('returns clip end when it exceeds last preview', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({
        clips: [createMockClip({ startTime: 0, duration: 20 })],
        previewFrames: [createMockPreviewFrame({ time: 14 })],
      })],
    });
    expect(computeDuration(comp)).toBe(20);
  });
});

describe('addPreviewFrame', () => {
  it('inserts and keeps array sorted by time', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({
        previewFrames: [
          createMockPreviewFrame({ id: 'pf1', time: 0 }),
          createMockPreviewFrame({ id: 'pf3', time: 10 }),
        ],
      })],
    });
    const inserted = createMockPreviewFrame({ id: 'pf2', time: 5 });
    const updated = addPreviewFrame(comp, 'track-1', inserted);
    expect(updated.tracks[0].previewFrames.map(p => p.id)).toEqual(['pf1', 'pf2', 'pf3']);
  });

  it('throws if track not found', () => {
    expect(() =>
      addPreviewFrame(createMockComposition(), 'nope', createMockPreviewFrame()),
    ).toThrow();
  });
});

describe('removePreviewFrameFromComposition', () => {
  it('removes the preview frame from its track', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({
        previewFrames: [createMockPreviewFrame({ id: 'pf1' })],
      })],
    });
    const updated = removePreviewFrameFromComposition(comp, 'pf1');
    expect(updated.tracks[0].previewFrames).toHaveLength(0);
  });
});

describe('updatePreviewFrameInComposition', () => {
  it('updates a preview frame and re-sorts', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({
        previewFrames: [
          createMockPreviewFrame({ id: 'pf1', time: 0 }),
          createMockPreviewFrame({ id: 'pf2', time: 5 }),
        ],
      })],
    });
    const updated = updatePreviewFrameInComposition(comp, 'pf1', pf => ({ ...pf, time: 10 }));
    expect(updated.tracks[0].previewFrames.map(p => p.id)).toEqual(['pf2', 'pf1']);
  });
});

describe('findPreviewFrameById', () => {
  it('returns the preview frame and its track', () => {
    const pf = createMockPreviewFrame({ id: 'pf1' });
    const comp = createMockComposition({
      tracks: [createMockTrack({ previewFrames: [pf] })],
    });
    const result = findPreviewFrameById(comp, 'pf1');
    expect(result).toBeDefined();
    expect(result!.previewFrame.id).toBe('pf1');
    expect(result!.track.id).toBe('track-1');
  });

  it('returns undefined for unknown id', () => {
    expect(findPreviewFrameById(createMockComposition(), 'nope')).toBeUndefined();
  });
});

describe('findGreatestPreviewFrameAtOrBefore', () => {
  const frames = [
    createMockPreviewFrame({ id: 'pf0', time: 0 }),
    createMockPreviewFrame({ id: 'pf2', time: 2 }),
    createMockPreviewFrame({ id: 'pf4', time: 4 }),
    createMockPreviewFrame({ id: 'pf6', time: 6 }),
  ];

  it('returns the one with greatest time ≤ T', () => {
    expect(findGreatestPreviewFrameAtOrBefore(frames, 0)?.id).toBe('pf0');
    expect(findGreatestPreviewFrameAtOrBefore(frames, 1.9)?.id).toBe('pf0');
    expect(findGreatestPreviewFrameAtOrBefore(frames, 2)?.id).toBe('pf2');
    expect(findGreatestPreviewFrameAtOrBefore(frames, 3.5)?.id).toBe('pf2');
    expect(findGreatestPreviewFrameAtOrBefore(frames, 6)?.id).toBe('pf6');
    expect(findGreatestPreviewFrameAtOrBefore(frames, 1000)?.id).toBe('pf6');
  });

  it('returns undefined when T is before the first frame', () => {
    expect(findGreatestPreviewFrameAtOrBefore(frames, -0.0001)).toBeUndefined();
  });

  it('returns undefined for an empty array', () => {
    expect(findGreatestPreviewFrameAtOrBefore([], 0)).toBeUndefined();
  });
});
