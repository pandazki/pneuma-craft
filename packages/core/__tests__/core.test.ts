import { describe, it, expect, vi } from 'vitest';
import { createCore } from '../src/core.js';
import type { Asset, CommandEnvelope } from '../src/types.js';

describe('CraftCore', () => {
  it('starts with empty state', () => {
    const core = createCore();
    const state = core.getState();
    expect(state.registry.size).toBe(0);
    expect(state.selection.type).toBe('none');
  });

  it('dispatch registers an asset', () => {
    const core = createCore();
    core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
    });
    const state = core.getState();
    expect(state.registry.size).toBe(1);
    const asset = Array.from(state.registry.values())[0];
    expect(asset.name).toBe('Test');
  });

  it('dispatch returns the produced events', () => {
    const core = createCore();
    const events = core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('asset:registered');
  });

  it('subscribe notifies on state change', () => {
    const core = createCore();
    const listener = vi.fn();
    core.subscribe(listener);
    core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'asset:registered' }));
  });

  it('unsubscribe stops notifications', () => {
    const core = createCore();
    const listener = vi.fn();
    const unsub = core.subscribe(listener);
    unsub();
    core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it('undo reverses the last command', () => {
    const core = createCore();
    core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
    });
    expect(core.getState().registry.size).toBe(1);
    core.undo();
    expect(core.getState().registry.size).toBe(0);
  });

  it('redo re-applies after undo', () => {
    const core = createCore();
    core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
    });
    core.undo();
    expect(core.getState().registry.size).toBe(0);
    core.redo();
    expect(core.getState().registry.size).toBe(1);
  });

  it('canUndo/canRedo reflect state', () => {
    const core = createCore();
    expect(core.canUndo()).toBe(false);
    expect(core.canRedo()).toBe(false);
    core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
    });
    expect(core.canUndo()).toBe(true);
    expect(core.canRedo()).toBe(false);
    core.undo();
    expect(core.canUndo()).toBe(false);
    expect(core.canRedo()).toBe(true);
    core.redo();
    expect(core.canUndo()).toBe(true);
    expect(core.canRedo()).toBe(false);
  });

  it('getEvents returns all events in order', () => {
    const core = createCore();
    core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/a.mp4', name: 'A', metadata: {} },
    });
    core.dispatch('agent', {
      type: 'asset:register',
      asset: { type: 'image', uri: '/b.png', name: 'B', metadata: {} },
    });
    const events = core.getEvents();
    expect(events).toHaveLength(2);
    expect(events[0].actor).toBe('human');
    expect(events[1].actor).toBe('agent');
  });

  it('throws on invalid command', () => {
    const core = createCore();
    expect(() => core.dispatch('human', { type: 'asset:remove', assetId: 'nonexistent' })).toThrow();
  });

  describe('dispatchEnvelope', () => {
    it('uses the envelope timestamp for asset.createdAt', () => {
      const core = createCore();
      const envelope: CommandEnvelope = {
        id: 'my-cmd-1',
        actor: 'human',
        timestamp: 1712934000000,
        command: {
          type: 'asset:register',
          asset: {
            id: 'a1',
            type: 'image',
            uri: '/x.png',
            name: 'x',
            metadata: {},
          },
        },
      };
      const events = core.dispatchEnvelope(envelope);
      expect(events).toHaveLength(1);
      expect(events[0].commandId).toBe('my-cmd-1');
      const asset = events[0].payload.asset as Asset;
      expect(asset.createdAt).toBe(1712934000000);
      expect(asset.id).toBe('a1');
    });

    it('records into the undo stack the same as dispatch', () => {
      const core = createCore();
      core.dispatchEnvelope({
        id: 'cmd-a',
        actor: 'human',
        timestamp: 1000,
        command: {
          type: 'asset:register',
          asset: { id: 'a1', type: 'image', uri: '/x.png', name: 'x', metadata: {} },
        },
      });
      expect(core.canUndo()).toBe(true);
      const compensating = core.undo();
      expect(compensating).not.toBeNull();
      expect(compensating![0].type).toBe('asset:removed');
      expect(core.getState().registry.has('a1')).toBe(false);
    });

    it('emits events whose ids are fresh but whose commandId matches the envelope', () => {
      const core = createCore();
      const events = core.dispatchEnvelope({
        id: 'my-specific-cmd-id',
        actor: 'agent',
        timestamp: 2000,
        command: {
          type: 'asset:register',
          asset: { type: 'video', uri: '/v.mp4', name: 'v', metadata: {} },
        },
      });
      expect(events[0].commandId).toBe('my-specific-cmd-id');
      expect(events[0].id).not.toBe('my-specific-cmd-id');
      expect(events[0].id.length).toBeGreaterThan(0);
      expect(events[0].actor).toBe('agent');
      expect(events[0].timestamp).toBe(2000);
    });
  });

  describe('full workflow: upload → derive → select → undo', () => {
    it('tracks provenance and supports undo', () => {
      const core = createCore();
      const [registered] = core.dispatch('human', {
        type: 'asset:register',
        asset: { type: 'image', uri: '/photo.jpg', name: 'Photo', metadata: { width: 3000 } },
      });
      const photoId = (registered.payload.asset as Asset).id;

      core.dispatch('human', {
        type: 'provenance:set-root', assetId: photoId,
        operation: { type: 'upload', actor: 'human', timestamp: Date.now() },
      });

      const [variantRegistered] = core.dispatch('agent', {
        type: 'asset:register',
        asset: { type: 'image', uri: '/photo-enhanced.jpg', name: 'Enhanced Photo', metadata: { width: 3000 } },
      });
      const variantId = (variantRegistered.payload.asset as Asset).id;

      core.dispatch('agent', {
        type: 'provenance:link', fromAssetId: photoId, toAssetId: variantId,
        operation: { type: 'derive', actor: 'agent', agentId: 'enhancer', timestamp: Date.now() },
      });

      let state = core.getState();
      expect(state.registry.size).toBe(2);
      expect(state.provenance.nodes.get(photoId)!.childIds).toContain(variantId);

      core.undo();
      state = core.getState();
      expect(state.provenance.nodes.get(photoId)!.childIds).not.toContain(variantId);

      core.redo();
      state = core.getState();
      expect(state.provenance.nodes.get(photoId)!.childIds).toContain(variantId);
    });
  });
});
