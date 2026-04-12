import { describe, it, expect } from 'vitest';
import { handleCompositionCommand } from '../src/command-handler.js';
import { createInitialState } from '@pneuma-craft/core';
import type { CommandEnvelope, PneumaCraftCoreState } from '@pneuma-craft/core';
import type { CompositionCommand, Track, Clip } from '../src/types.js';
import type { CompositionState } from '../src/state.js';
import { createMockComposition, createMockTrack, createMockClip, defaultSettings } from './helpers.js';

function makeEnvelope(command: CompositionCommand): CommandEnvelope<CompositionCommand> {
  return { id: 'cmd-1', actor: 'human', timestamp: 1000, command };
}

function stateWith(composition: import('../src/types.js').Composition | null): CompositionState {
  return { composition };
}

function coreWithAsset(assetId: string): PneumaCraftCoreState {
  const state = createInitialState();
  const registry = new Map(state.registry);
  registry.set(assetId, {
    id: assetId, type: 'video', uri: '/test.mp4', name: 'Test', metadata: {}, createdAt: 1000,
  });
  return { ...state, registry };
}

const coreState = createInitialState();
const emptyCompState = stateWith(null);

describe('composition:create', () => {
  it('produces composition:created event', () => {
    const events = handleCompositionCommand(coreState, emptyCompState, makeEnvelope({
      type: 'composition:create', settings: defaultSettings,
    }));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('composition:created');
  });

  it('throws if composition already exists', () => {
    const compState = stateWith(createMockComposition());
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:create', settings: defaultSettings,
    }))).toThrow();
  });
});

describe('composition:add-track', () => {
  it('produces composition:track-added event with generated id', () => {
    const compState = stateWith(createMockComposition());
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:add-track',
      track: { type: 'video', name: 'V1', clips: [], muted: false, volume: 1, locked: false, visible: true },
    }));
    expect(events[0].type).toBe('composition:track-added');
    expect((events[0].payload.track as Track).id).toBeDefined();
  });

  it('throws if no composition', () => {
    expect(() => handleCompositionCommand(coreState, emptyCompState, makeEnvelope({
      type: 'composition:add-track',
      track: { type: 'video', name: 'V1', clips: [], muted: false, volume: 1, locked: false, visible: true },
    }))).toThrow();
  });
});

describe('composition:remove-track', () => {
  it('produces composition:track-removed event', () => {
    const track = createMockTrack({ id: 't1' });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:remove-track', trackId: 't1',
    }));
    expect(events[0].type).toBe('composition:track-removed');
    expect(events[0].payload.track).toEqual(track);
  });

  it('throws if track has clips', () => {
    const track = createMockTrack({ clips: [createMockClip()] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:remove-track', trackId: 'track-1',
    }))).toThrow();
  });
});

describe('composition:add-clip', () => {
  it('produces composition:clip-added event', () => {
    const track = createMockTrack({ id: 't1' });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const core = coreWithAsset('asset-1');
    const events = handleCompositionCommand(core, compState, makeEnvelope({
      type: 'composition:add-clip', trackId: 't1',
      clip: { assetId: 'asset-1', startTime: 0, duration: 5, inPoint: 0, outPoint: 5 },
    }));
    expect(events[0].type).toBe('composition:clip-added');
    expect((events[0].payload.clip as Clip).trackId).toBe('t1');
  });

  it('throws if track locked', () => {
    const track = createMockTrack({ id: 't1', locked: true });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    expect(() => handleCompositionCommand(coreWithAsset('asset-1'), compState, makeEnvelope({
      type: 'composition:add-clip', trackId: 't1',
      clip: { assetId: 'asset-1', startTime: 0, duration: 5, inPoint: 0, outPoint: 5 },
    }))).toThrow();
  });

  it('throws if assetId not in core registry', () => {
    const track = createMockTrack({ id: 't1' });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:add-clip', trackId: 't1',
      clip: { assetId: 'nope', startTime: 0, duration: 5, inPoint: 0, outPoint: 5 },
    }))).toThrow();
  });

  it('ripples overlapping clips on same track', () => {
    const existing = createMockClip({ id: 'c1', startTime: 0, duration: 5 });
    const track = createMockTrack({ id: 't1', clips: [existing] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const core = coreWithAsset('asset-1');
    const events = handleCompositionCommand(core, compState, makeEnvelope({
      type: 'composition:add-clip', trackId: 't1',
      clip: { assetId: 'asset-1', startTime: 0, duration: 3, inPoint: 0, outPoint: 3 },
    }));
    // Should produce: clip-added + clip-moved (ripple c1 from 0 to 3)
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('composition:clip-added');
    expect(events[1].type).toBe('composition:clip-moved');
    expect(events[1].payload.clipId).toBe('c1');
    expect(events[1].payload.startTime).toBe(3);
    expect(events[1].payload.previousStartTime).toBe(0);
  });

  it('ripples chain of clips', () => {
    const c1 = createMockClip({ id: 'c1', startTime: 0, duration: 3 });
    const c2 = createMockClip({ id: 'c2', startTime: 3, duration: 3 });
    const c3 = createMockClip({ id: 'c3', startTime: 6, duration: 3 });
    const track = createMockTrack({ id: 't1', clips: [c1, c2, c3] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const core = coreWithAsset('asset-1');
    const events = handleCompositionCommand(core, compState, makeEnvelope({
      type: 'composition:add-clip', trackId: 't1',
      clip: { assetId: 'asset-1', startTime: 0, duration: 2, inPoint: 0, outPoint: 2 },
    }));
    // Insert at 0 with duration 2 → ripple c1 to 2, c2 to 5, c3 to 8
    expect(events).toHaveLength(4); // added + 3 ripple moves
    expect(events[1].payload.clipId).toBe('c1');
    expect(events[1].payload.startTime).toBe(2);
    expect(events[2].payload.clipId).toBe('c2');
    expect(events[2].payload.startTime).toBe(5);
    expect(events[3].payload.clipId).toBe('c3');
    expect(events[3].payload.startTime).toBe(8);
  });

  it('does not ripple when no overlap', () => {
    const existing = createMockClip({ id: 'c1', startTime: 10, duration: 5 });
    const track = createMockTrack({ id: 't1', clips: [existing] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const core = coreWithAsset('asset-1');
    const events = handleCompositionCommand(core, compState, makeEnvelope({
      type: 'composition:add-clip', trackId: 't1',
      clip: { assetId: 'asset-1', startTime: 0, duration: 3, inPoint: 0, outPoint: 3 },
    }));
    expect(events).toHaveLength(1); // just the add, no ripple
  });
});

describe('composition:remove-clip', () => {
  it('produces composition:clip-removed event', () => {
    const clip = createMockClip({ id: 'c1' });
    const track = createMockTrack({ clips: [clip] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:remove-clip', clipId: 'c1',
    }));
    expect(events[0].type).toBe('composition:clip-removed');
    expect(events[0].payload.clip).toEqual(clip);
  });

  it('throws if track locked', () => {
    const clip = createMockClip({ id: 'c1' });
    const track = createMockTrack({ locked: true, clips: [clip] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:remove-clip', clipId: 'c1',
    }))).toThrow();
  });
});

describe('composition:move-clip', () => {
  it('produces composition:clip-moved event', () => {
    const clip = createMockClip({ id: 'c1', startTime: 0 });
    const track = createMockTrack({ clips: [clip] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:move-clip', clipId: 'c1', startTime: 10,
    }));
    expect(events[0].payload.startTime).toBe(10);
    expect(events[0].payload.previousStartTime).toBe(0);
  });

  it('throws if target track locked', () => {
    const clip = createMockClip({ id: 'c1', trackId: 't1' });
    const t1 = createMockTrack({ id: 't1', clips: [clip] });
    const t2 = createMockTrack({ id: 't2', locked: true });
    const compState = stateWith(createMockComposition({ tracks: [t1, t2] }));
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:move-clip', clipId: 'c1', startTime: 5, trackId: 't2',
    }))).toThrow();
  });

  it('ripples overlapping clips on same track when moving', () => {
    const c1 = createMockClip({ id: 'c1', trackId: 't1', startTime: 0, duration: 5 });
    const c2 = createMockClip({ id: 'c2', trackId: 't1', startTime: 10, duration: 5 });
    const track = createMockTrack({ id: 't1', clips: [c1, c2] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    // Move c1 to startTime=8 → overlaps with c2 at [10,15)
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:move-clip', clipId: 'c1', startTime: 8,
    }));
    // c1 moved + c2 rippled
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('composition:clip-moved');
    expect(events[0].payload.clipId).toBe('c1');
    expect(events[1].type).toBe('composition:clip-moved');
    expect(events[1].payload.clipId).toBe('c2');
    expect(events[1].payload.startTime).toBe(13); // 8 + 5 = 13
  });
});

describe('composition:trim-clip', () => {
  it('produces composition:clip-trimmed event with previous values', () => {
    const clip = createMockClip({ id: 'c1', inPoint: 0, outPoint: 10, duration: 10 });
    const track = createMockTrack({ clips: [clip] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:trim-clip', clipId: 'c1', inPoint: 2, outPoint: 8, duration: 6,
    }));
    expect(events[0].payload.previousInPoint).toBe(0);
    expect(events[0].payload.duration).toBe(6);
  });
});

describe('composition:split-clip', () => {
  it('produces composition:clip-split event', () => {
    const clip = createMockClip({ id: 'c1', startTime: 10, duration: 10, inPoint: 0, outPoint: 10 });
    const track = createMockTrack({ clips: [clip] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:split-clip', clipId: 'c1', time: 15,
    }));
    const left = events[0].payload.leftClip as Clip;
    const right = events[0].payload.rightClip as Clip;
    expect(left.id).toBe('c1');
    expect(left.duration).toBe(5);
    expect(left.outPoint).toBe(5);
    expect(right.startTime).toBe(15);
    expect(right.duration).toBe(5);
    expect(right.inPoint).toBe(5);
  });

  it('throws if time outside clip range', () => {
    const clip = createMockClip({ id: 'c1', startTime: 10, duration: 10 });
    const track = createMockTrack({ clips: [clip] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:split-clip', clipId: 'c1', time: 10,
    }))).toThrow();
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:split-clip', clipId: 'c1', time: 20,
    }))).toThrow();
  });
});

describe('composition:reorder-tracks', () => {
  it('produces composition:tracks-reordered event', () => {
    const t1 = createMockTrack({ id: 't1' });
    const t2 = createMockTrack({ id: 't2' });
    const compState = stateWith(createMockComposition({ tracks: [t1, t2] }));
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:reorder-tracks', trackIds: ['t2', 't1'],
    }));
    expect(events[0].payload.trackIds).toEqual(['t2', 't1']);
    expect(events[0].payload.previousTrackIds).toEqual(['t1', 't2']);
  });

  it('throws if trackIds count mismatch', () => {
    const compState = stateWith(createMockComposition({ tracks: [createMockTrack({ id: 't1' })] }));
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:reorder-tracks', trackIds: ['t1', 't2'],
    }))).toThrow();
  });
});
