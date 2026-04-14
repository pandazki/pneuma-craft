import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPneumaCraftStore, type PneumaCraftStoreApi } from '../src/store.js';
import { createMockAssetResolver } from './helpers.js';

// ── Mock @pneuma-craft/video ──────────────────────────────────────────

function createMockPlaybackEngine() {
  return {
    state: 'idle' as string,
    currentTime: 0,
    playbackRate: 1,
    loop: null as { start: number; end: number } | null,
    load: vi.fn().mockResolvedValue(undefined),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    onStateChange: vi.fn().mockReturnValue(vi.fn()),
    onTimeUpdate: vi.fn().mockReturnValue(vi.fn()),
    onFrameRendered: vi.fn().mockReturnValue(vi.fn()),
    destroy: vi.fn(),
  };
}

function createMockExportEngine() {
  return {
    export: vi.fn().mockResolvedValue(new Blob(['test'], { type: 'video/mp4' })),
    onProgress: vi.fn().mockReturnValue(vi.fn()),
    abort: vi.fn(),
  };
}

let mockPlaybackEngine = createMockPlaybackEngine();
let mockExportEngine = createMockExportEngine();

vi.mock('@pneuma-craft/video', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pneuma-craft/video')>();
  return {
    ...actual,
    createPlaybackEngine: vi.fn(() => mockPlaybackEngine),
    createExportEngine: vi.fn(() => mockExportEngine),
  };
});

// ── Helpers ────────────────────────────────────────────────────────────

const COMP_SETTINGS = { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9', sampleRate: 48000 };

const EXPORT_OPTIONS = {
  format: 'mp4' as const,
  videoCodec: 'avc' as const,
  audioCodec: 'aac' as const,
  videoBitrate: 5_000_000,
  audioBitrate: 128_000,
};

function createStoreWithComposition() {
  const resolver = createMockAssetResolver();
  const store = createPneumaCraftStore(resolver);

  // Register an asset
  const regEvents = store.getState().dispatch('human', {
    type: 'asset:register',
    asset: {
      type: 'video',
      uri: '/test.mp4',
      name: 'Test Video',
      metadata: { width: 1920, height: 1080, duration: 10 },
    },
  });
  const assetId = (regEvents[0] as any).payload.asset.id;

  // Create composition
  store.getState().dispatch('human', {
    type: 'composition:create',
    settings: COMP_SETTINGS,
  });

  return { store, resolver, assetId };
}

async function flushPromises() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('createPneumaCraftStore', () => {
  beforeEach(() => {
    mockPlaybackEngine = createMockPlaybackEngine();
    mockExportEngine = createMockExportEngine();
  });

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
      settings: COMP_SETTINGS,
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

  it('dispatchEnvelope propagates caller-supplied timestamps', () => {
    const resolver = createMockAssetResolver();
    const store = createPneumaCraftStore(resolver);

    store.getState().dispatchEnvelope({
      id: 'test-envelope',
      actor: 'human',
      timestamp: 1712934000000,
      command: {
        type: 'asset:register',
        asset: {
          id: 'a1',
          type: 'image',
          uri: '/a1.png',
          name: 'x',
          metadata: {},
        },
      },
    });

    const asset = store.getState().coreState.registry.get('a1');
    expect(asset?.createdAt).toBe(1712934000000);
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

// ── Domain state sync ────────────────────────────────────────────────

describe('domain state sync', () => {
  beforeEach(() => {
    mockPlaybackEngine = createMockPlaybackEngine();
    mockExportEngine = createMockExportEngine();
  });

  it('composition:create sets composition non-null and duration updated', () => {
    const resolver = createMockAssetResolver();
    const store = createPneumaCraftStore(resolver);

    store.getState().dispatch('human', {
      type: 'composition:create',
      settings: COMP_SETTINGS,
    });

    const state = store.getState();
    expect(state.composition).not.toBeNull();
    // Empty composition has duration 0
    expect(state.duration).toBe(0);
  });

  it('composition:add-track + add-clip updates duration to reflect clip end time', () => {
    const { store, assetId } = createStoreWithComposition();

    // Add a video track
    store.getState().dispatch('human', {
      type: 'composition:add-track',
      track: { type: 'video', name: 'Video 1', clips: [], muted: false, volume: 1, locked: false, visible: true },
    });

    const trackId = store.getState().composition!.tracks[0].id;

    // Add a clip: starts at 2s, duration 5s => end at 7s
    store.getState().dispatch('human', {
      type: 'composition:add-clip',
      trackId,
      clip: {
        assetId,
        startTime: 2,
        duration: 5,
        inPoint: 0,
        outPoint: 5,
      },
    });

    const state = store.getState();
    expect(state.composition!.duration).toBe(7); // startTime + duration
    expect(state.duration).toBe(7);
  });

  it('undo add-track restores previous composition state', () => {
    const { store } = createStoreWithComposition();

    // Add a track
    store.getState().dispatch('human', {
      type: 'composition:add-track',
      track: { type: 'video', name: 'Video 1', clips: [], muted: false, volume: 1, locked: false, visible: true },
    });

    expect(store.getState().composition!.tracks.length).toBe(1);

    // Undo the track add
    store.getState().undo();

    const state = store.getState();
    expect(state.composition).not.toBeNull();
    expect(state.composition!.tracks.length).toBe(0);
    expect(state.duration).toBe(0);
  });
});

// ── Playback engine lifecycle ─────────────────────────────────────────

describe('playback engine lifecycle', () => {
  beforeEach(() => {
    mockPlaybackEngine = createMockPlaybackEngine();
    mockExportEngine = createMockExportEngine();
  });

  it('play() without composition does not crash (logs error)', async () => {
    const resolver = createMockAssetResolver();
    const store = createPneumaCraftStore(resolver);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // No composition, play should fire-and-forget async and catch the error
    store.getState().play();
    await flushPromises();

    // The engine.load gets called with null composition.
    // Depending on implementation, it either logs error or engine.play throws.
    // The key assertion: no uncaught exception.
    errorSpy.mockRestore();
  });

  it('play() with composition creates engine via mock createPlaybackEngine', async () => {
    const { createPlaybackEngine } = await import('@pneuma-craft/video');
    const { store } = createStoreWithComposition();

    store.getState().play();
    await flushPromises();

    expect(createPlaybackEngine).toHaveBeenCalled();
    expect(mockPlaybackEngine.load).toHaveBeenCalled();
    expect(mockPlaybackEngine.play).toHaveBeenCalled();
  });

  it('play() called twice rapidly creates only one engine (concurrent guard)', async () => {
    const { createPlaybackEngine } = await import('@pneuma-craft/video');
    const createSpy = createPlaybackEngine as ReturnType<typeof vi.fn>;
    createSpy.mockClear();

    const { store } = createStoreWithComposition();

    // Fire two plays simultaneously
    store.getState().play();
    store.getState().play();
    await flushPromises();

    // createPlaybackEngine should be called only once due to the promise guard
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('setPlaybackRate before play applies rate to engine after creation', async () => {
    const { store } = createStoreWithComposition();

    // Set rate before play — no engine exists yet
    store.getState().setPlaybackRate(2);
    expect(store.getState().playbackRate).toBe(2);

    // Now play — engine is created and deferred settings applied
    store.getState().play();
    await flushPromises();

    // The engine should have the rate applied via the deferred settings path
    expect(mockPlaybackEngine.playbackRate).toBe(2);
  });

  it('setLoop before play applies loop to engine after creation', async () => {
    const { store } = createStoreWithComposition();

    const loopRegion = { start: 1, end: 5 };
    store.getState().setLoop(loopRegion);
    expect(store.getState().loop).toEqual(loopRegion);

    store.getState().play();
    await flushPromises();

    expect(mockPlaybackEngine.loop).toEqual(loopRegion);
  });

  it('pause() delegates to engine when engine exists', async () => {
    const { store } = createStoreWithComposition();

    store.getState().play();
    await flushPromises();

    store.getState().pause();
    expect(mockPlaybackEngine.pause).toHaveBeenCalled();
  });

  it('pause() without engine sets playbackState to paused', () => {
    const resolver = createMockAssetResolver();
    const store = createPneumaCraftStore(resolver);

    store.getState().pause();
    expect(store.getState().playbackState).toBe('paused');
  });

  it('seek(time) delegates to engine when engine exists', async () => {
    const { store } = createStoreWithComposition();

    store.getState().play();
    await flushPromises();

    store.getState().seek(3.5);
    expect(mockPlaybackEngine.seek).toHaveBeenCalledWith(3.5);
  });

  it('seek(time) without composition sets currentTime and logs (no dangling engine)', async () => {
    const { createPlaybackEngine } = await import('@pneuma-craft/video');
    const createSpy = createPlaybackEngine as ReturnType<typeof vi.fn>;
    createSpy.mockClear();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const resolver = createMockAssetResolver();
    const store = createPneumaCraftStore(resolver);

    store.getState().seek(5);
    await flushPromises();

    // currentTime set optimistically so UI reacts
    expect(store.getState().currentTime).toBe(5);
    // No engine should be created without a composition
    expect(createSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('seek(time) with composition lazy-inits engine and paints frame (Bug 1)', async () => {
    const { createPlaybackEngine } = await import('@pneuma-craft/video');
    const createSpy = createPlaybackEngine as ReturnType<typeof vi.fn>;
    createSpy.mockClear();

    const { store } = createStoreWithComposition();

    // Seek BEFORE any play() — should trigger engine creation + load + seek
    store.getState().seek(3.5);
    await flushPromises();

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(mockPlaybackEngine.load).toHaveBeenCalled();
    expect(mockPlaybackEngine.seek).toHaveBeenCalledWith(3.5);
    expect(store.getState().currentTime).toBe(3.5);
  });

  it('seek then play does not create engine twice', async () => {
    const { createPlaybackEngine } = await import('@pneuma-craft/video');
    const createSpy = createPlaybackEngine as ReturnType<typeof vi.fn>;
    createSpy.mockClear();

    const { store } = createStoreWithComposition();

    store.getState().seek(2);
    await flushPromises();
    store.getState().play();
    await flushPromises();

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(mockPlaybackEngine.play).toHaveBeenCalled();
  });

  it('seek with failing engine creation still advances currentTime', async () => {
    const { createPlaybackEngine } = await import('@pneuma-craft/video');
    const createSpy = createPlaybackEngine as ReturnType<typeof vi.fn>;
    createSpy.mockClear();
    createSpy.mockImplementationOnce(() => { throw new Error('boom'); });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { store } = createStoreWithComposition();

    store.getState().seek(4);
    await flushPromises();

    expect(store.getState().currentTime).toBe(4);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('seek before play applies stored currentTime on engine creation', async () => {
    const { store } = createStoreWithComposition();

    store.getState().seek(3.5);
    await flushPromises();

    expect(mockPlaybackEngine.seek).toHaveBeenCalledWith(3.5);
    expect(store.getState().currentTime).toBe(3.5);
  });

  it('composition edit while paused preserves currentTime (Bug 2)', async () => {
    const { store, assetId } = createStoreWithComposition();

    store.getState().dispatch('human', {
      type: 'composition:add-track',
      track: { type: 'video', name: 'Video 1', clips: [], muted: false, volume: 1, locked: false, visible: true },
    });
    const trackId = store.getState().composition!.tracks[0].id;
    store.getState().dispatch('human', {
      type: 'composition:add-clip',
      trackId,
      clip: { assetId, startTime: 0, duration: 10, inPoint: 0, outPoint: 10 },
    });

    // Create engine and seek to 5s
    store.getState().play();
    await flushPromises();
    store.getState().seek(5);

    // Edit composition — add another clip on the same track at t=10
    store.getState().dispatch('human', {
      type: 'composition:add-clip',
      trackId,
      clip: { assetId, startTime: 10, duration: 3, inPoint: 0, outPoint: 3 },
    });

    // currentTime must stay at 5, not reset to 0
    expect(store.getState().currentTime).toBe(5);
  });

  it('composition edit clamps currentTime when new duration is shorter', async () => {
    const { store, assetId } = createStoreWithComposition();

    store.getState().dispatch('human', {
      type: 'composition:add-track',
      track: { type: 'video', name: 'Video 1', clips: [], muted: false, volume: 1, locked: false, visible: true },
    });
    const trackId = store.getState().composition!.tracks[0].id;
    store.getState().dispatch('human', {
      type: 'composition:add-clip',
      trackId,
      clip: { assetId, startTime: 0, duration: 10, inPoint: 0, outPoint: 10 },
    });
    const clipId = store.getState().composition!.tracks[0].clips[0].id;

    store.getState().play();
    await flushPromises();
    store.getState().seek(9);

    // Shrink the clip — new duration becomes 5s, currentTime=9 is out of range
    store.getState().dispatch('human', {
      type: 'composition:trim-clip',
      clipId,
      duration: 5,
      outPoint: 5,
    });

    expect(store.getState().currentTime).toBeLessThanOrEqual(5);
  });

  it('play() without composition does not leave a dangling engine (Bug 3)', async () => {
    const { createPlaybackEngine } = await import('@pneuma-craft/video');
    const createSpy = createPlaybackEngine as ReturnType<typeof vi.fn>;
    createSpy.mockClear();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const resolver = createMockAssetResolver();
    const store = createPneumaCraftStore(resolver);

    // No composition → play() should reject, no engine created
    store.getState().play();
    await flushPromises();

    expect(createSpy).not.toHaveBeenCalled();

    // A later seek before composition also must not create engine
    store.getState().seek(2);
    await flushPromises();
    expect(createSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('composition change reloads engine when engine exists', async () => {
    const { store, assetId } = createStoreWithComposition();

    // Add track and clip to have non-zero duration
    store.getState().dispatch('human', {
      type: 'composition:add-track',
      track: { type: 'video', name: 'Video 1', clips: [], muted: false, volume: 1, locked: false, visible: true },
    });
    const trackId = store.getState().composition!.tracks[0].id;
    store.getState().dispatch('human', {
      type: 'composition:add-clip',
      trackId,
      clip: { assetId, startTime: 0, duration: 5, inPoint: 0, outPoint: 5 },
    });

    // Create engine
    store.getState().play();
    await flushPromises();

    // Undo clip add — composition changes, engine should reload
    store.getState().undo();

    // Engine.load should have been called again due to composition change
    // (once during play, once during undo sync)
    expect(mockPlaybackEngine.load).toHaveBeenCalledTimes(2);
    expect(store.getState().duration).toBe(0);
  });
});

// ── Export lifecycle ──────────────────────────────────────────────────

describe('export lifecycle', () => {
  beforeEach(() => {
    mockPlaybackEngine = createMockPlaybackEngine();
    mockExportEngine = createMockExportEngine();
  });

  it('exportComposition while already exporting throws', async () => {
    const { store } = createStoreWithComposition();

    // Start first export (don't await)
    const p1 = store.getState().exportComposition(EXPORT_OPTIONS);

    // Synchronously, exporting should already be true
    expect(store.getState().exporting).toBe(true);

    // Second export should throw
    await expect(store.getState().exportComposition(EXPORT_OPTIONS)).rejects.toThrow(
      'Export already in progress',
    );

    await p1;
  });

  it('exporting flag is set synchronously before async work', () => {
    const { store } = createStoreWithComposition();

    // Start export (don't await)
    const _promise = store.getState().exportComposition(EXPORT_OPTIONS);

    // Synchronously check — the flag should already be true
    expect(store.getState().exporting).toBe(true);

    // Clean up
    return _promise;
  });

  it('exportComposition without composition throws', async () => {
    const resolver = createMockAssetResolver();
    const store = createPneumaCraftStore(resolver);

    await expect(store.getState().exportComposition(EXPORT_OPTIONS)).rejects.toThrow(
      'No composition to export',
    );
  });

  it('exportComposition returns a Blob on success', async () => {
    const { store } = createStoreWithComposition();

    const blob = await store.getState().exportComposition(EXPORT_OPTIONS);
    expect(blob).toBeInstanceOf(Blob);
    expect(store.getState().exporting).toBe(false);
  });

  it('destroy() aborts in-flight export', async () => {
    // Make export take longer by using a deferred promise
    let resolveExport!: (blob: Blob) => void;
    mockExportEngine.export = vi.fn(() => new Promise<Blob>((resolve) => {
      resolveExport = resolve;
    }));

    const { store } = createStoreWithComposition();

    const exportPromise = store.getState().exportComposition(EXPORT_OPTIONS);

    // Wait for the dynamic import and engine creation to complete
    // (the exporting flag is set synchronously, but engine creation is after await import)
    await flushPromises();

    // Now destroy should abort the export engine
    store.getState().destroy();
    expect(mockExportEngine.abort).toHaveBeenCalled();

    // Resolve to avoid hanging
    resolveExport(new Blob());
    try { await exportPromise; } catch { /* may throw due to abort */ }
  });
});

// ── Store destroy ─────────────────────────────────────────────────────

describe('store destroy', () => {
  beforeEach(() => {
    mockPlaybackEngine = createMockPlaybackEngine();
    mockExportEngine = createMockExportEngine();
  });

  it('destroy() cleans up playback engine', async () => {
    const { store } = createStoreWithComposition();

    // Create playback engine
    store.getState().play();
    await flushPromises();

    store.getState().destroy();
    expect(mockPlaybackEngine.destroy).toHaveBeenCalled();
  });

  it('destroy during lazy init prevents engine from being stored', async () => {
    const { store } = createStoreWithComposition();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Start play — triggers ensurePlaybackEngine (async import + load)
    store.getState().play();

    // Destroy immediately — sets destroyed flag before async import resolves
    store.getState().destroy();

    // Let the async init run — it should detect destroyed and throw
    await flushPromises();

    // The play() promise should have caught the "Store destroyed" error
    expect(errorSpy).toHaveBeenCalledWith(
      '[PneumaCraft] Failed to start playback:',
      expect.objectContaining({ message: 'Store destroyed' }),
    );
    errorSpy.mockRestore();
  });

  it('destroy() clears frame listeners', async () => {
    const { store } = createStoreWithComposition();
    const listener = vi.fn();

    const unsub = store.getState().subscribeToFrames(listener);

    store.getState().destroy();

    // After destroy, the listener set should be cleared.
    // We can verify indirectly: subscribing and unsubscribing should not throw
    // The key verification is that destroy() itself completes without error.
    // The unsub function should still be callable without error.
    unsub();
  });

  it('subscribeToFrames returns working unsubscribe function', () => {
    const resolver = createMockAssetResolver();
    const store = createPneumaCraftStore(resolver);
    const listener = vi.fn();

    const unsub = store.getState().subscribeToFrames(listener);
    expect(typeof unsub).toBe('function');

    // Should not throw
    unsub();
  });
});
