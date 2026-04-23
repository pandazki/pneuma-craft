import { describe, it, expect } from 'vitest';
import { resolveFrame } from '../src/resolve-frame.js';
import { createMockComposition, createMockTrack, createMockClip } from './helpers.js';

describe('resolveFrame', () => {
  it('returns empty clips for empty composition', () => {
    const comp = createMockComposition();
    const frame = resolveFrame(comp, 0);
    expect(frame.time).toBe(0);
    expect(frame.clips).toEqual([]);
  });

  it('resolves active clip at given time', () => {
    const clip = createMockClip({ startTime: 2, duration: 5, inPoint: 0, outPoint: 5 });
    const track = createMockTrack({ clips: [clip] });
    const comp = createMockComposition({ tracks: [track] });
    const frame = resolveFrame(comp, 4);
    expect(frame.clips).toHaveLength(1);
    expect(frame.clips[0].clip.id).toBe('clip-1');
    expect(frame.clips[0].localTime).toBe(2);
  });

  it('uses half-open interval [start, end)', () => {
    const clip = createMockClip({ startTime: 0, duration: 5 });
    const track = createMockTrack({ clips: [clip] });
    const comp = createMockComposition({ tracks: [track] });
    expect(resolveFrame(comp, 0).clips).toHaveLength(1);
    expect(resolveFrame(comp, 4.999).clips).toHaveLength(1);
    expect(resolveFrame(comp, 5).clips).toHaveLength(0);
  });

  it('computes localTime with inPoint offset', () => {
    const clip = createMockClip({ startTime: 10, duration: 5, inPoint: 3, outPoint: 8 });
    const track = createMockTrack({ clips: [clip] });
    const comp = createMockComposition({ tracks: [track] });
    const frame = resolveFrame(comp, 12);
    expect(frame.clips[0].localTime).toBe(5);
  });

  it('does NOT skip muted tracks — muted controls audio only, picture stays visible', () => {
    // Rationale: in standard NLE semantics, muting a video track silences
    // its audio but keeps its picture on-screen. `muted` is enforced at the
    // audio scheduler / offline renderer layers; resolveFrame is the picture
    // path and must not couple the two.
    const clip = createMockClip({ startTime: 0, duration: 10 });
    const mutedTrack = createMockTrack({ muted: true, clips: [clip] });
    const comp = createMockComposition({ tracks: [mutedTrack] });
    expect(resolveFrame(comp, 5).clips).toHaveLength(1);
  });

  it('skips tracks with visible:false — video-layer equivalent of muted', () => {
    const clip = createMockClip({ startTime: 0, duration: 10 });
    const hiddenTrack = createMockTrack({ visible: false, clips: [clip] });
    const comp = createMockComposition({ tracks: [hiddenTrack] });
    expect(resolveFrame(comp, 5).clips).toHaveLength(0);
  });

  it('keeps tracks where visible is true or undefined — legacy compositions must still render', () => {
    const clip = createMockClip({ startTime: 0, duration: 10 });

    // visible: true (explicit)
    const visibleTrack = createMockTrack({ id: 'visible', visible: true, clips: [clip] });
    expect(resolveFrame(
      createMockComposition({ tracks: [visibleTrack] }),
      5,
    ).clips).toHaveLength(1);

    // visible: undefined (legacy — field absent). Cast around the Track
    // factory's default of `true` so we can exercise the `=== false` guard
    // against a genuinely undefined field.
    const legacyTrack = {
      ...createMockTrack({ id: 'legacy', clips: [clip] }),
      visible: undefined as unknown as boolean,
    };
    expect(resolveFrame(
      createMockComposition({ tracks: [legacyTrack] }),
      5,
    ).clips).toHaveLength(1);
  });

  it('returns clips from multiple tracks in order', () => {
    const clip1 = createMockClip({ id: 'c1', trackId: 't1', startTime: 0, duration: 10 });
    const clip2 = createMockClip({ id: 'c2', trackId: 't2', startTime: 0, duration: 10 });
    const track1 = createMockTrack({ id: 't1', clips: [clip1] });
    const track2 = createMockTrack({ id: 't2', clips: [clip2] });
    const comp = createMockComposition({ tracks: [track1, track2] });
    const frame = resolveFrame(comp, 5);
    expect(frame.clips).toHaveLength(2);
    expect(frame.clips[0].track.id).toBe('t1');
    expect(frame.clips[1].track.id).toBe('t2');
  });

  it('handles gap between clips', () => {
    const clip1 = createMockClip({ id: 'c1', startTime: 0, duration: 3 });
    const clip2 = createMockClip({ id: 'c2', startTime: 6, duration: 3 });
    const track = createMockTrack({ clips: [clip1, clip2] });
    const comp = createMockComposition({ tracks: [track] });
    expect(resolveFrame(comp, 4).clips).toHaveLength(0);
    expect(resolveFrame(comp, 7).clips).toHaveLength(1);
    expect(resolveFrame(comp, 7).clips[0].clip.id).toBe('c2');
  });

  it('resolves multiple clips on same track at same time (overlapping)', () => {
    const clip1 = createMockClip({ id: 'c1', startTime: 0, duration: 10 });
    const clip2 = createMockClip({ id: 'c2', startTime: 5, duration: 10 });
    const track = createMockTrack({ clips: [clip1, clip2] });
    const comp = createMockComposition({ tracks: [track] });
    const frame = resolveFrame(comp, 7);
    expect(frame.clips).toHaveLength(2);
  });
});
