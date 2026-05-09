import { describe, it, expect } from 'vitest';
import { resolveFrame } from '../src/resolve-frame.js';
import { createMockComposition, createMockTrack, createMockClip, createMockPreviewFrame } from './helpers.js';

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

  it('returns empty previewFrames for compositions without preview frames', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({ clips: [createMockClip({ startTime: 0, duration: 5 })] })],
    });
    expect(resolveFrame(comp, 2).previewFrames).toEqual([]);
  });
});

// ── Preview Frame Resolution ───────────────────────────────────────────

describe('resolveFrame — preview frames', () => {
  it('Scenario A: empty track + 8 sketches every 2s — step function', () => {
    const sketches = [0, 2, 4, 6, 8, 10, 12, 14].map(t =>
      createMockPreviewFrame({ id: `pf-${t}`, time: t, assetId: `sketch-${t}` }),
    );
    const track = createMockTrack({ previewFrames: sketches });
    const comp = createMockComposition({ tracks: [track] });

    expect(resolveFrame(comp, 0).previewFrames[0]?.previewFrame.id).toBe('pf-0');
    expect(resolveFrame(comp, 1.99).previewFrames[0]?.previewFrame.id).toBe('pf-0');
    expect(resolveFrame(comp, 2).previewFrames[0]?.previewFrame.id).toBe('pf-2');
    expect(resolveFrame(comp, 7).previewFrames[0]?.previewFrame.id).toBe('pf-6');
    expect(resolveFrame(comp, 14).previewFrames[0]?.previewFrame.id).toBe('pf-14');
    // resolveFrame doesn't clamp to duration — past last preview, last wins
    expect(resolveFrame(comp, 100).previewFrames[0]?.previewFrame.id).toBe('pf-14');
  });

  it('Scenario C: clip on the same track suppresses the preview at that time', () => {
    const sketches = [
      createMockPreviewFrame({ id: 'pf-2', time: 2, assetId: 'sketch-2' }),
      createMockPreviewFrame({ id: 'pf-6', time: 6, assetId: 'sketch-6' }),
    ];
    const clip = createMockClip({ id: 'real', startTime: 4, duration: 4, assetId: 'real-asset' });
    const track = createMockTrack({ clips: [clip], previewFrames: sketches });
    const comp = createMockComposition({ tracks: [track] });

    // T=3 — no clip; preview pf-2 wins
    const f3 = resolveFrame(comp, 3);
    expect(f3.clips).toHaveLength(0);
    expect(f3.previewFrames[0]?.previewFrame.id).toBe('pf-2');

    // T=5 — clip covers; preview must let go
    const f5 = resolveFrame(comp, 5);
    expect(f5.clips[0]?.clip.id).toBe('real');
    expect(f5.previewFrames).toHaveLength(0);

    // T=8 — clip ends at 8 (half-open, [4, 8) ); preview pf-6 takes over
    const f8 = resolveFrame(comp, 8);
    expect(f8.clips).toHaveLength(0);
    expect(f8.previewFrames[0]?.previewFrame.id).toBe('pf-6');
  });

  it('let-go is per-track — track A clip does not suppress track B preview', () => {
    const trackA = createMockTrack({
      id: 'A',
      clips: [createMockClip({ id: 'a-clip', trackId: 'A', startTime: 0, duration: 10 })],
    });
    const trackB = createMockTrack({
      id: 'B',
      previewFrames: [createMockPreviewFrame({ id: 'b-pf', trackId: 'B', time: 5 })],
    });
    const comp = createMockComposition({ tracks: [trackA, trackB] });

    const f = resolveFrame(comp, 6);
    expect(f.clips.map(c => c.track.id)).toEqual(['A']);
    expect(f.previewFrames.map(p => p.track.id)).toEqual(['B']);
  });

  it('returns no preview when T is before the first preview frame', () => {
    const track = createMockTrack({
      previewFrames: [createMockPreviewFrame({ time: 5 })],
    });
    const comp = createMockComposition({ tracks: [track] });
    expect(resolveFrame(comp, 0).previewFrames).toHaveLength(0);
    expect(resolveFrame(comp, 4.99).previewFrames).toHaveLength(0);
    expect(resolveFrame(comp, 5).previewFrames).toHaveLength(1);
  });

  it('skips invisible track for preview frames as well', () => {
    const track = createMockTrack({
      visible: false,
      previewFrames: [createMockPreviewFrame({ time: 0 })],
    });
    const comp = createMockComposition({ tracks: [track] });
    expect(resolveFrame(comp, 0).previewFrames).toHaveLength(0);
  });

  it('does not produce previewFrames for non-video tracks', () => {
    // I2 is enforced at the command handler — but resolveFrame must also
    // be defensive: even if a non-video track somehow carries previewFrames
    // (e.g. legacy data), they must not be rendered.
    const audioTrack = createMockTrack({
      type: 'audio',
      previewFrames: [createMockPreviewFrame({ time: 0 })],
    });
    const subtitleTrack = createMockTrack({
      id: 'sub',
      type: 'subtitle',
      previewFrames: [createMockPreviewFrame({ id: 'pf-sub', time: 0 })],
    });
    const comp = createMockComposition({ tracks: [audioTrack, subtitleTrack] });
    expect(resolveFrame(comp, 0).previewFrames).toHaveLength(0);
  });

  it('preview array order follows composition.tracks order (z-order)', () => {
    const trackBack = createMockTrack({
      id: 'back',
      previewFrames: [createMockPreviewFrame({ id: 'pf-back', trackId: 'back', time: 0 })],
    });
    const trackFront = createMockTrack({
      id: 'front',
      previewFrames: [createMockPreviewFrame({ id: 'pf-front', trackId: 'front', time: 0 })],
    });
    const comp = createMockComposition({ tracks: [trackBack, trackFront] });
    const f = resolveFrame(comp, 0);
    expect(f.previewFrames.map(p => p.track.id)).toEqual(['back', 'front']);
  });
});
