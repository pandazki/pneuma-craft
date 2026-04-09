import { describe, it, expect } from 'vitest';
import { createPneumaCraftStore } from '../src/store.js';
import { createMockAssetResolver } from './helpers.js';

describe('createPneumaCraftStore', () => {
  it('creates store with initial state', () => {
    const resolver = createMockAssetResolver();
    const store = createPneumaCraftStore(resolver);
    const state = store.getState();

    // Core state
    expect(state.coreState.registry.size).toBe(0);
    expect(state.coreState.selection.type).toBe('none');

    // Composition
    expect(state.composition).toBeNull();

    // Undo/redo
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(false);
    expect(state.events).toEqual([]);

    // Playback
    expect(state.playbackState).toBe('idle');
    expect(state.currentTime).toBe(0);
    expect(state.duration).toBe(0);
    expect(state.playbackRate).toBe(1);
    expect(state.loop).toBeNull();

    // Export
    expect(state.exporting).toBe(false);
    expect(state.exportProgress).toBe(0);
  });

  it('dispatches asset:register and updates store', () => {
    const resolver = createMockAssetResolver();
    const store = createPneumaCraftStore(resolver);

    const events = store.getState().dispatch('human', {
      type: 'asset:register',
      asset: {
        type: 'video',
        uri: '/test.mp4',
        name: 'Test Video',
        metadata: { width: 1920, height: 1080, duration: 10 },
      },
    });

    expect(events.length).toBeGreaterThan(0);
    const state = store.getState();
    expect(state.coreState.registry.size).toBe(1);
    expect(state.canUndo).toBe(true);
    expect(state.events.length).toBeGreaterThan(0);
  });

  it('dispatches composition:create and updates store', () => {
    const resolver = createMockAssetResolver();
    const store = createPneumaCraftStore(resolver);

    store.getState().dispatch('human', {
      type: 'composition:create',
      settings: { width: 1920, height: 1080, fps: 30, sampleRate: 48000 },
    });

    const state = store.getState();
    expect(state.composition).not.toBeNull();
    expect(state.composition!.settings.width).toBe(1920);
  });

  it('supports undo and redo', () => {
    const resolver = createMockAssetResolver();
    const store = createPneumaCraftStore(resolver);

    store.getState().dispatch('human', {
      type: 'asset:register',
      asset: {
        type: 'video',
        uri: '/test.mp4',
        name: 'Test Video',
        metadata: {},
      },
    });

    expect(store.getState().coreState.registry.size).toBe(1);

    // Undo
    const undoEvents = store.getState().undo();
    expect(undoEvents).not.toBeNull();
    expect(store.getState().coreState.registry.size).toBe(0);
    expect(store.getState().canRedo).toBe(true);

    // Redo
    const redoEvents = store.getState().redo();
    expect(redoEvents).not.toBeNull();
    expect(store.getState().coreState.registry.size).toBe(1);
  });

  it('stores assetResolver reference', () => {
    const resolver = createMockAssetResolver();
    const store = createPneumaCraftStore(resolver);

    expect(store.getState()._assetResolver).toBe(resolver);
  });

  it('defaults compositorType to auto', () => {
    const resolver = createMockAssetResolver();
    const store = createPneumaCraftStore(resolver);

    expect(store.getState()._compositorType).toBe('auto');
  });
});
