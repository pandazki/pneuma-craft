import { describe, it, expect } from 'vitest';
import { invertCompositionEvent } from '../src/undo.js';
import type { Event } from '@pneuma-craft/core';
import { createMockTrack, createMockClip, createMockPreviewFrame } from './helpers.js';

function makeEvent(type: string, payload: Record<string, unknown>): Event {
  return { id: 'e1', commandId: 'c1', actor: 'human', timestamp: 1000, type, payload };
}

describe('invertCompositionEvent', () => {
  it('composition:created throws (not invertible)', () => {
    expect(() => invertCompositionEvent(
      makeEvent('composition:created', { composition: {} }),
    )).toThrow();
  });

  it('composition:track-added → composition:track-removed', () => {
    const track = createMockTrack({ id: 't1' });
    const inv = invertCompositionEvent(makeEvent('composition:track-added', { track }));
    expect(inv.type).toBe('composition:track-removed');
    expect(inv.payload.trackId).toBe('t1');
    expect(inv.payload.track).toEqual(track);
  });

  it('composition:track-removed → composition:track-added', () => {
    const track = createMockTrack({ id: 't1' });
    const inv = invertCompositionEvent(makeEvent('composition:track-removed', { trackId: 't1', track }));
    expect(inv.type).toBe('composition:track-added');
    expect(inv.payload.track).toEqual(track);
  });

  it('composition:clip-added → composition:clip-removed', () => {
    const clip = createMockClip({ id: 'c1' });
    const inv = invertCompositionEvent(makeEvent('composition:clip-added', { trackId: 't1', clip }));
    expect(inv.type).toBe('composition:clip-removed');
    expect(inv.payload.clipId).toBe('c1');
    expect(inv.payload.trackId).toBe('t1');
  });

  it('composition:clip-removed → composition:clip-added', () => {
    const clip = createMockClip({ id: 'c1' });
    const inv = invertCompositionEvent(makeEvent('composition:clip-removed', { clipId: 'c1', clip, trackId: 't1' }));
    expect(inv.type).toBe('composition:clip-added');
    expect(inv.payload.trackId).toBe('t1');
  });

  it('composition:clip-moved → reverse move', () => {
    const inv = invertCompositionEvent(makeEvent('composition:clip-moved', {
      clipId: 'c1', startTime: 20, trackId: 't2', previousStartTime: 5, previousTrackId: 't1',
    }));
    expect(inv.type).toBe('composition:clip-moved');
    expect(inv.payload.startTime).toBe(5);
    expect(inv.payload.trackId).toBe('t1');
    expect(inv.payload.previousStartTime).toBe(20);
  });

  it('composition:clip-trimmed → reverse trim', () => {
    const inv = invertCompositionEvent(makeEvent('composition:clip-trimmed', {
      clipId: 'c1', inPoint: 2, outPoint: 8, duration: 6,
      previousInPoint: 0, previousOutPoint: 10, previousDuration: 10,
    }));
    expect(inv.type).toBe('composition:clip-trimmed');
    expect(inv.payload.inPoint).toBe(0);
    expect(inv.payload.duration).toBe(10);
    expect(inv.payload.previousInPoint).toBe(2);
  });

  it('composition:clip-split → composition:clip-unsplit', () => {
    const original = createMockClip({ id: 'c1', startTime: 10, duration: 10 });
    const left = { ...original, duration: 5 };
    const right = { ...original, id: 'c2', startTime: 15, duration: 5 };
    const inv = invertCompositionEvent(makeEvent('composition:clip-split', {
      clipId: 'c1', time: 15, newClipId: 'c2', leftClip: left, rightClip: right, originalClip: original,
    }));
    expect(inv.type).toBe('composition:clip-unsplit');
    expect(inv.payload.clipId).toBe('c1');
    expect(inv.payload.newClipId).toBe('c2');
    expect(inv.payload.originalClip).toEqual(original);
  });

  it('composition:tracks-reordered → reverse reorder', () => {
    const inv = invertCompositionEvent(makeEvent('composition:tracks-reordered', {
      trackIds: ['t2', 't1'], previousTrackIds: ['t1', 't2'],
    }));
    expect(inv.type).toBe('composition:tracks-reordered');
    expect(inv.payload.trackIds).toEqual(['t1', 't2']);
  });

  // ── Preview Frame Inversions ──────────────────────────────────────────

  it('composition:preview-frame-added → preview-frame-removed', () => {
    const pf = createMockPreviewFrame({ id: 'pf-1', trackId: 't1' });
    const inv = invertCompositionEvent(makeEvent('composition:preview-frame-added', { previewFrame: pf }));
    expect(inv.type).toBe('composition:preview-frame-removed');
    expect(inv.payload.previewFrameId).toBe('pf-1');
    expect(inv.payload.previewFrame).toEqual(pf);
    expect(inv.payload.trackId).toBe('t1');
  });

  it('composition:preview-frame-removed → preview-frame-added', () => {
    const pf = createMockPreviewFrame({ id: 'pf-1' });
    const inv = invertCompositionEvent(makeEvent('composition:preview-frame-removed', {
      previewFrameId: 'pf-1', previewFrame: pf, trackId: 't1',
    }));
    expect(inv.type).toBe('composition:preview-frame-added');
    expect(inv.payload.previewFrame).toEqual(pf);
  });

  it('composition:preview-frame-moved → reverse move', () => {
    const inv = invertCompositionEvent(makeEvent('composition:preview-frame-moved', {
      previewFrameId: 'pf-1', time: 8, trackId: 't2', previousTime: 4, previousTrackId: 't1',
    }));
    expect(inv.type).toBe('composition:preview-frame-moved');
    expect(inv.payload.time).toBe(4);
    expect(inv.payload.trackId).toBe('t1');
    expect(inv.payload.previousTime).toBe(8);
    expect(inv.payload.previousTrackId).toBe('t2');
  });

  it('composition:preview-frame-rebound → reverse rebind', () => {
    const inv = invertCompositionEvent(makeEvent('composition:preview-frame-rebound', {
      previewFrameId: 'pf-1', assetId: 'anchor', previousAssetId: 'sketch',
    }));
    expect(inv.type).toBe('composition:preview-frame-rebound');
    expect(inv.payload.assetId).toBe('sketch');
    expect(inv.payload.previousAssetId).toBe('anchor');
  });
});
