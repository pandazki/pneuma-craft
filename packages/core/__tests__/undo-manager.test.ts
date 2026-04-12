import { describe, it, expect } from 'vitest';
import { createUndoManager, invertCoreEvent } from '../src/undo-manager.js';
import { createInitialState, applyEvent } from '../src/state.js';
import { handleCommand } from '../src/command-handler.js';
import type { Event, CommandEnvelope, Asset } from '../src/types.js';

function makeEnvelope(command: CommandEnvelope['command'], id = 'cmd-1'): CommandEnvelope {
  return { id, actor: 'human', timestamp: Date.now(), command };
}

describe('UndoManager', () => {
  it('starts with nothing to undo/redo', () => {
    const manager = createUndoManager();
    expect(manager.canUndo()).toBe(false);
    expect(manager.canRedo()).toBe(false);
  });

  it('can undo after recording', () => {
    const manager = createUndoManager();
    const event: Event = {
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'asset:registered',
      payload: { asset: { id: 'a1', type: 'video', uri: '/t.mp4', name: 'T', metadata: {}, createdAt: 1000 } },
    };
    manager.record('cmd-1', [event]);
    expect(manager.canUndo()).toBe(true);
  });

  it('undo of asset:registered produces asset:removed', () => {
    const manager = createUndoManager();
    const asset: Asset = { id: 'a1', type: 'video', uri: '/t.mp4', name: 'T', metadata: {}, createdAt: 1000 };
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'asset:registered', payload: { asset },
    }]);
    const compensating = manager.undo();
    expect(compensating).toHaveLength(1);
    expect(compensating![0].type).toBe('asset:removed');
    expect(compensating![0].payload.assetId).toBe('a1');
    expect(compensating![0].payload.asset).toEqual(asset);
  });

  it('undo of asset:removed produces asset:registered', () => {
    const manager = createUndoManager();
    const asset: Asset = { id: 'a1', type: 'video', uri: '/t.mp4', name: 'T', metadata: {}, createdAt: 1000 };
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'asset:removed', payload: { assetId: 'a1', asset },
    }]);
    const compensating = manager.undo();
    expect(compensating![0].type).toBe('asset:registered');
    expect((compensating![0].payload.asset as Asset).id).toBe('a1');
  });

  it('undo of asset:metadata-updated restores previous metadata', () => {
    const manager = createUndoManager();
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'asset:metadata-updated',
      payload: { assetId: 'a1', metadata: { fps: 30 }, previousMetadata: { width: 1920 } },
    }]);
    const compensating = manager.undo()!;
    expect(compensating[0].type).toBe('asset:metadata-updated');
    expect(compensating[0].payload.metadata).toEqual({ width: 1920 });
    expect(compensating[0].payload.previousMetadata).toEqual({ fps: 30 });
  });

  it('undo of asset:tagged restores previous tags', () => {
    const manager = createUndoManager();
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'asset:tagged',
      payload: { assetId: 'a1', tags: ['new'], previousTags: ['old'] },
    }]);
    const compensating = manager.undo()!;
    expect(compensating[0].type).toBe('asset:tagged');
    expect(compensating[0].payload.tags).toEqual(['old']);
    expect(compensating[0].payload.previousTags).toEqual(['new']);
  });

  it('undo of selection:set restores previous selection', () => {
    const manager = createUndoManager();
    const prev = { type: 'none' as const, ids: [] };
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'selection:set',
      payload: { selection: { type: 'asset', ids: ['a1'] }, previousSelection: prev },
    }]);
    const compensating = manager.undo()!;
    expect(compensating[0].type).toBe('selection:set');
    expect(compensating[0].payload.selection).toEqual(prev);
  });

  it('undo of selection:cleared restores previous selection', () => {
    const manager = createUndoManager();
    const prev = { type: 'asset' as const, ids: ['a1'] };
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'selection:cleared', payload: { previousSelection: prev },
    }]);
    const compensating = manager.undo()!;
    expect(compensating[0].type).toBe('selection:set');
    expect(compensating[0].payload.selection).toEqual(prev);
  });

  it('undo of provenance:linked produces provenance:unlinked', () => {
    const op = { type: 'derive' as const, actor: 'agent' as const, timestamp: 2000 };
    const manager = createUndoManager();
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'provenance:linked',
      payload: { edgeId: 'edge-1', fromAssetId: 'p1', toAssetId: 'c1', operation: op },
    }]);
    const compensating = manager.undo()!;
    expect(compensating[0].type).toBe('provenance:unlinked');
    expect(compensating[0].payload.edgeId).toBe('edge-1');
  });

  it('undo of provenance:unlinked produces provenance:linked', () => {
    const op = { type: 'derive' as const, actor: 'agent' as const, timestamp: 2000 };
    const edge = { id: 'edge-1', fromAssetId: 'p1', toAssetId: 'c1', operation: op };
    const manager = createUndoManager();
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'provenance:unlinked', payload: { edgeId: 'edge-1', edge },
    }]);
    const compensating = manager.undo()!;
    expect(compensating[0].type).toBe('provenance:linked');
    expect(compensating[0].payload.edgeId).toBe('edge-1');
    expect(compensating[0].payload.fromAssetId).toBe('p1');
  });

  it('redo reverses the undo', () => {
    const manager = createUndoManager();
    const asset: Asset = { id: 'a1', type: 'video', uri: '/t.mp4', name: 'T', metadata: {}, createdAt: 1000 };
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'asset:registered', payload: { asset },
    }]);
    manager.undo();
    expect(manager.canRedo()).toBe(true);
    const redoEvents = manager.redo()!;
    expect(redoEvents[0].type).toBe('asset:registered');
    expect((redoEvents[0].payload.asset as Asset).id).toBe('a1');
  });

  it('new record clears redo stack', () => {
    const manager = createUndoManager();
    const asset: Asset = { id: 'a1', type: 'video', uri: '/t.mp4', name: 'T', metadata: {}, createdAt: 1000 };
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'asset:registered', payload: { asset },
    }]);
    manager.undo();
    expect(manager.canRedo()).toBe(true);
    manager.record('cmd-2', [{
      id: 'e2', commandId: 'cmd-2', actor: 'human', timestamp: 2000,
      type: 'asset:registered', payload: { asset: { ...asset, id: 'a2' } },
    }]);
    expect(manager.canRedo()).toBe(false);
  });

  describe('end-to-end: undo restores state', () => {
    it('register then undo then redo', () => {
      const manager = createUndoManager();
      const state0 = createInitialState();
      const envelope = makeEnvelope({
        type: 'asset:register',
        asset: { type: 'video', uri: '/t.mp4', name: 'T', metadata: {} },
      });
      const events = handleCommand(state0, envelope);
      manager.record(envelope.id, events);
      const state1 = events.reduce(applyEvent, state0);
      expect(state1.registry.size).toBe(1);
      const compensating = manager.undo()!;
      const state2 = compensating.reduce(applyEvent, state1);
      expect(state2.registry.size).toBe(0);
      const redoEvents = manager.redo()!;
      const state3 = redoEvents.reduce(applyEvent, state2);
      expect(state3.registry.size).toBe(1);
    });
  });
});

describe('invertCoreEvent — asset:status-changed', () => {
  it('swaps status and previousStatus', () => {
    const original: Event = {
      id: 'evt-1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'asset:status-changed',
      payload: { assetId: 'asset-1', status: 'ready', previousStatus: 'generating' },
    };
    const inverted = invertCoreEvent(original);
    expect(inverted.type).toBe('asset:status-changed');
    expect(inverted.payload).toMatchObject({
      assetId: 'asset-1',
      status: 'generating',
      previousStatus: 'ready',
    });
    expect(inverted.commandId).toBe('cmd-1'); // preserved
    expect(inverted.id).not.toBe('evt-1'); // fresh id
  });

  it('inverts cleanly when previousStatus was undefined', () => {
    const original: Event = {
      id: 'evt-1', commandId: 'cmd-1', actor: 'agent', timestamp: 1000,
      type: 'asset:status-changed',
      payload: { assetId: 'asset-1', status: 'failed', previousStatus: undefined },
    };
    const inverted = invertCoreEvent(original);
    // Inverting "undefined → failed" produces "failed → undefined"
    expect(inverted.payload).toMatchObject({
      assetId: 'asset-1',
      status: undefined,
      previousStatus: 'failed',
    });
  });
});
