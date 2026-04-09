import { describe, it, expect } from 'vitest';
import { createInitialCompositionState, applyCompositionEvent } from '../src/state.js';
import type { Event } from '@pneuma-craft/core';
import { createMockComposition, createMockTrack, createMockClip, defaultSettings } from './helpers.js';

function makeEvent(type: string, payload: Record<string, unknown>): Event {
  return { id: 'e1', commandId: 'c1', actor: 'human', timestamp: 1000, type, payload };
}

describe('createInitialCompositionState', () => {
  it('starts with null composition', () => {
    expect(createInitialCompositionState().composition).toBeNull();
  });
});

describe('applyCompositionEvent', () => {
  it('composition:created sets composition', () => {
    const comp = createMockComposition();
    const state = applyCompositionEvent(createInitialCompositionState(), makeEvent('composition:created', { composition: comp }));
    expect(state.composition).toEqual(comp);
  });

  it('composition:track-added adds track', () => {
    const track = createMockTrack({ id: 't1' });
    let state = { composition: createMockComposition() };
    state = applyCompositionEvent(state, makeEvent('composition:track-added', { track }));
    expect(state.composition!.tracks).toHaveLength(1);
  });

  it('composition:track-removed removes track', () => {
    const track = createMockTrack({ id: 't1' });
    let state = { composition: createMockComposition({ tracks: [track] }) };
    state = applyCompositionEvent(state, makeEvent('composition:track-removed', { trackId: 't1', track }));
    expect(state.composition!.tracks).toHaveLength(0);
  });

  it('composition:clip-added adds clip to track and sorts', () => {
    const existing = createMockClip({ id: 'c1', startTime: 10 });
    const track = createMockTrack({ id: 't1', clips: [existing] });
    const newClip = createMockClip({ id: 'c2', trackId: 't1', startTime: 5 });
    let state = { composition: createMockComposition({ tracks: [track] }) };
    state = applyCompositionEvent(state, makeEvent('composition:clip-added', { trackId: 't1', clip: newClip }));
    const clips = state.composition!.tracks[0].clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].id).toBe('c2');
    expect(clips[1].id).toBe('c1');
  });

  it('composition:clip-removed removes clip and recomputes duration', () => {
    const clip = createMockClip({ id: 'c1', startTime: 0, duration: 10 });
    const track = createMockTrack({ clips: [clip] });
    let state = { composition: createMockComposition({ tracks: [track], duration: 10 }) };
    state = applyCompositionEvent(state, makeEvent('composition:clip-removed', { clipId: 'c1', clip, trackId: 'track-1' }));
    expect(state.composition!.tracks[0].clips).toHaveLength(0);
    expect(state.composition!.duration).toBe(0);
  });

  it('composition:clip-moved updates startTime and recomputes duration', () => {
    const clip = createMockClip({ id: 'c1', startTime: 0, duration: 5 });
    const track = createMockTrack({ clips: [clip] });
    let state = { composition: createMockComposition({ tracks: [track], duration: 5 }) };
    state = applyCompositionEvent(state, makeEvent('composition:clip-moved', {
      clipId: 'c1', startTime: 20, trackId: undefined, previousStartTime: 0, previousTrackId: 'track-1',
    }));
    expect(state.composition!.tracks[0].clips[0].startTime).toBe(20);
    expect(state.composition!.duration).toBe(25);
  });

  it('composition:clip-moved to different track', () => {
    const clip = createMockClip({ id: 'c1', trackId: 't1', startTime: 0, duration: 5 });
    const t1 = createMockTrack({ id: 't1', clips: [clip] });
    const t2 = createMockTrack({ id: 't2' });
    let state = { composition: createMockComposition({ tracks: [t1, t2] }) };
    state = applyCompositionEvent(state, makeEvent('composition:clip-moved', {
      clipId: 'c1', startTime: 10, trackId: 't2', previousStartTime: 0, previousTrackId: 't1',
    }));
    expect(state.composition!.tracks[0].clips).toHaveLength(0);
    expect(state.composition!.tracks[1].clips).toHaveLength(1);
    expect(state.composition!.tracks[1].clips[0].trackId).toBe('t2');
  });

  it('composition:clip-trimmed updates clip trim points', () => {
    const clip = createMockClip({ id: 'c1', inPoint: 0, outPoint: 10, duration: 10 });
    const track = createMockTrack({ clips: [clip] });
    let state = { composition: createMockComposition({ tracks: [track] }) };
    state = applyCompositionEvent(state, makeEvent('composition:clip-trimmed', {
      clipId: 'c1', inPoint: 2, outPoint: 8, duration: 6,
      previousInPoint: 0, previousOutPoint: 10, previousDuration: 10,
    }));
    const updated = state.composition!.tracks[0].clips[0];
    expect(updated.inPoint).toBe(2);
    expect(updated.outPoint).toBe(8);
    expect(updated.duration).toBe(6);
  });

  it('composition:clip-split replaces clip with left and right', () => {
    const clip = createMockClip({ id: 'c1', startTime: 10, duration: 10, inPoint: 0, outPoint: 10 });
    const track = createMockTrack({ clips: [clip] });
    const leftClip = { ...clip, duration: 5, outPoint: 5 };
    const rightClip = { ...clip, id: 'c2', startTime: 15, duration: 5, inPoint: 5 };
    let state = { composition: createMockComposition({ tracks: [track] }) };
    state = applyCompositionEvent(state, makeEvent('composition:clip-split', {
      clipId: 'c1', time: 15, newClipId: 'c2', leftClip, rightClip, originalClip: clip,
    }));
    const clips = state.composition!.tracks[0].clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].id).toBe('c1');
    expect(clips[0].duration).toBe(5);
    expect(clips[1].id).toBe('c2');
    expect(clips[1].startTime).toBe(15);
  });

  it('composition:tracks-reordered reorders tracks', () => {
    const t1 = createMockTrack({ id: 't1' });
    const t2 = createMockTrack({ id: 't2' });
    let state = { composition: createMockComposition({ tracks: [t1, t2] }) };
    state = applyCompositionEvent(state, makeEvent('composition:tracks-reordered', {
      trackIds: ['t2', 't1'], previousTrackIds: ['t1', 't2'],
    }));
    expect(state.composition!.tracks[0].id).toBe('t2');
    expect(state.composition!.tracks[1].id).toBe('t1');
  });

  it('composition:clip-unsplit restores original clip', () => {
    const original = createMockClip({ id: 'c1', startTime: 10, duration: 10, inPoint: 0, outPoint: 10 });
    const left = { ...original, duration: 5, outPoint: 5 };
    const right = { ...original, id: 'c2', startTime: 15, duration: 5, inPoint: 5 };
    const track = createMockTrack({ clips: [left, right] });
    let state = { composition: createMockComposition({ tracks: [track] }) };
    state = applyCompositionEvent(state, makeEvent('composition:clip-unsplit', {
      clipId: 'c1', newClipId: 'c2', originalClip: original,
    }));
    const clips = state.composition!.tracks[0].clips;
    expect(clips).toHaveLength(1);
    expect(clips[0].id).toBe('c1');
    expect(clips[0].duration).toBe(10);
  });

  it('ignores unknown event types', () => {
    const state = createInitialCompositionState();
    const same = applyCompositionEvent(state, makeEvent('asset:registered', {}));
    expect(same).toBe(state);
  });
});
