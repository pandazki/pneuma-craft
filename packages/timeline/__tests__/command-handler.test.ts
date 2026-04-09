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
      track: { type: 'video', name: 'V1', clips: [], muted: false, volume: 1, locked: false },
    }));
    expect(events[0].type).toBe('composition:track-added');
    expect((events[0].payload.track as Track).id).toBeDefined();
  });

  it('throws if no composition', () => {
    expect(() => handleCompositionCommand(coreState, emptyCompState, makeEnvelope({
      type: 'composition:add-track',
      track: { type: 'video', name: 'V1', clips: [], muted: false, volume: 1, locked: false },
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
