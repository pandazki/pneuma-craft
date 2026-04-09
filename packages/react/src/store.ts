import { createStore } from 'zustand/vanilla';
import type {
  Actor,
  CoreCommand,
  Event,
  PneumaCraftCoreState,
} from '@pneuma-craft/core';
import type {
  Composition,
  CompositionCommand,
} from '@pneuma-craft/timeline';
import { createTimelineCore } from '@pneuma-craft/timeline';
import type {
  PlaybackState,
  ExportOptions,
  AssetResolver,
  PlaybackEngine,
  ExportEngine,
  CompositorType,
  RenderedFrame,
} from '@pneuma-craft/video';

export interface PneumaCraftStore {
  // Domain State (from TimelineCore)
  readonly coreState: PneumaCraftCoreState;
  readonly composition: Composition | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly events: readonly Event[];

  // Playback State
  readonly playbackState: PlaybackState;
  readonly currentTime: number;
  readonly duration: number;
  readonly playbackRate: number;
  readonly loop: { start: number; end: number } | null;

  // Export State
  readonly exporting: boolean;
  readonly exportProgress: number;

  // Actions
  dispatch: (actor: Actor, command: CoreCommand | CompositionCommand) => Event[];
  undo: () => Event[] | null;
  redo: () => Event[] | null;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  setLoop: (loop: { start: number; end: number } | null) => void;
  exportComposition: (options: ExportOptions) => Promise<Blob>;
  abortExport: () => void;
  subscribeToFrames: (cb: (frame: RenderedFrame) => void) => () => void;
  destroy: () => void;

  // Internal
  _assetResolver: AssetResolver;
  _compositorType: CompositorType;
}

export type PneumaCraftStoreApi = ReturnType<typeof createPneumaCraftStore>;

export function createPneumaCraftStore(
  assetResolver: AssetResolver,
  compositorType: CompositorType = 'auto',
) {
  const timelineCore = createTimelineCore();

  // Mutable references for lazily-created engines
  const engines: {
    playback: PlaybackEngine | null;
    export: ExportEngine | null;
  } = { playback: null, export: null };

  // Frame rendering listeners for preview
  const frameListeners = new Set<(frame: RenderedFrame) => void>();

  // Track the last composition identity so we can detect changes
  let lastCompositionRef: Composition | null = null;

  // Promise guard to prevent duplicate PlaybackEngine creation
  let playbackInitPromise: Promise<PlaybackEngine> | null = null;

  // Flag to prevent async continuations after destroy()
  let destroyed = false;

  async function ensurePlaybackEngine(
    get: () => PneumaCraftStore,
    set: (partial: Partial<PneumaCraftStore>) => void,
  ): Promise<PlaybackEngine> {
    if (engines.playback) return engines.playback;
    if (playbackInitPromise) return playbackInitPromise;

    playbackInitPromise = (async () => {
      const { createPlaybackEngine } = await import('@pneuma-craft/video');
      if (destroyed) throw new Error('Store destroyed');

      const engine = createPlaybackEngine({ compositorType: get()._compositorType });

      engine.onTimeUpdate((time) => {
        set({ currentTime: time });
      });
      engine.onStateChange((state) => {
        set({ playbackState: state });
      });
      engine.onFrameRendered((frame) => {
        for (const cb of frameListeners) cb(frame);
      });

      const composition = get().composition;
      if (composition) {
        await engine.load(composition, get()._assetResolver);
        if (destroyed) {
          engine.destroy();
          throw new Error('Store destroyed');
        }
      }

      // Apply deferred playback settings
      engine.playbackRate = get().playbackRate;
      engine.loop = get().loop;
      const storedTime = get().currentTime;
      if (storedTime > 0) {
        engine.seek(storedTime);
      }

      engines.playback = engine;
      return engine;
    })();

    try {
      return await playbackInitPromise;
    } finally {
      playbackInitPromise = null;
    }
  }

  function syncDomainState(): Partial<PneumaCraftStore> {
    const composition = timelineCore.getComposition();
    const compositionChanged = composition !== lastCompositionRef;
    lastCompositionRef = composition;

    // If composition changed and playback engine exists, reload or destroy it
    if (compositionChanged && engines.playback) {
      if (composition) {
        engines.playback.load(composition, assetResolver).catch(console.error);
        return {
          coreState: timelineCore.getCoreState(),
          composition,
          canUndo: timelineCore.canUndo(),
          canRedo: timelineCore.canRedo(),
          events: timelineCore.getEvents(),
          duration: composition.duration,
          currentTime: 0,
        };
      } else {
        engines.playback.destroy();
        engines.playback = null;
      }
    }

    // If composition was removed, reset playback state
    if (!composition && compositionChanged) {
      return {
        coreState: timelineCore.getCoreState(),
        composition,
        canUndo: timelineCore.canUndo(),
        canRedo: timelineCore.canRedo(),
        events: timelineCore.getEvents(),
        duration: 0,
        playbackState: 'idle' as PlaybackState,
        currentTime: 0,
      };
    }

    return {
      coreState: timelineCore.getCoreState(),
      composition,
      canUndo: timelineCore.canUndo(),
      canRedo: timelineCore.canRedo(),
      events: timelineCore.getEvents(),
      duration: composition?.duration ?? 0,
    };
  }

  const store = createStore<PneumaCraftStore>((set, get) => ({
    // Domain State
    coreState: timelineCore.getCoreState(),
    composition: timelineCore.getComposition(),
    canUndo: false,
    canRedo: false,
    events: [],

    // Playback State
    playbackState: 'idle',
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    loop: null,

    // Export State
    exporting: false,
    exportProgress: 0,

    // Actions
    dispatch(actor: Actor, command: CoreCommand | CompositionCommand): Event[] {
      const events = timelineCore.dispatch(actor, command);
      set(syncDomainState());
      return events;
    },

    undo(): Event[] | null {
      const events = timelineCore.undo();
      set(syncDomainState());
      return events;
    },

    redo(): Event[] | null {
      const events = timelineCore.redo();
      set(syncDomainState());
      return events;
    },

    play(): void {
      ensurePlaybackEngine(get, set)
        .then((engine) => {
          engine.play();
          // State will be updated by onStateChange callback
        })
        .catch((err) => {
          console.error('[PneumaCraft] Failed to start playback:', err);
        });
    },

    pause(): void {
      if (engines.playback) {
        engines.playback.pause();
      } else {
        set({ playbackState: 'paused' });
      }
    },

    seek(time: number): void {
      if (engines.playback) {
        engines.playback.seek(time);
      } else {
        set({ currentTime: time });
      }
    },

    setPlaybackRate(rate: number): void {
      set({ playbackRate: rate });
      if (engines.playback) {
        engines.playback.playbackRate = rate;
      }
    },

    setLoop(loop: { start: number; end: number } | null): void {
      set({ loop });
      if (engines.playback) {
        engines.playback.loop = loop;
      }
    },

    async exportComposition(options: ExportOptions): Promise<Blob> {
      if (get().exporting) {
        throw new Error('Export already in progress. Abort the current export first.');
      }

      const composition = get().composition;
      if (!composition) {
        throw new Error('No composition to export');
      }

      // Set guard immediately, synchronously, before any async work
      set({ exporting: true, exportProgress: 0 });

      try {
        const { createExportEngine } = await import('@pneuma-craft/video');
        if (destroyed) throw new Error('Store destroyed');
        engines.export = createExportEngine();

        const unsubProgress = engines.export.onProgress((progress) => {
          set({ exportProgress: progress });
        });

        try {
          const blob = await engines.export.export(composition, options, assetResolver);
          set({ exporting: false, exportProgress: 1 });
          return blob;
        } finally {
          unsubProgress();
        }
      } catch (error) {
        set({ exporting: false, exportProgress: 0 });
        throw error;
      } finally {
        engines.export = null;
      }
    },

    abortExport(): void {
      if (engines.export) {
        engines.export.abort();
      }
    },

    subscribeToFrames(cb: (frame: RenderedFrame) => void): () => void {
      frameListeners.add(cb);
      return () => { frameListeners.delete(cb); };
    },

    destroy(): void {
      destroyed = true;
      engines.playback?.destroy();
      engines.playback = null;
      engines.export?.abort();
      engines.export = null;
      frameListeners.clear();
    },

    // Internal
    _assetResolver: assetResolver,
    _compositorType: compositorType,
  }));

  return store;
}
