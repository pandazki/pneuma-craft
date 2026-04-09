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

  function syncDomainState(): Partial<PneumaCraftStore> {
    return {
      coreState: timelineCore.getCoreState(),
      composition: timelineCore.getComposition(),
      canUndo: timelineCore.canUndo(),
      canRedo: timelineCore.canRedo(),
      events: timelineCore.getEvents(),
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
      // Playback engine lazily created — stubbed for now
      set({ playbackState: 'playing' });
    },

    pause(): void {
      set({ playbackState: 'paused' });
    },

    seek(time: number): void {
      set({ currentTime: time });
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
      const composition = get().composition;
      if (!composition) {
        throw new Error('No composition to export');
      }

      const { createExportEngine } = await import('@pneuma-craft/video');
      engines.export = createExportEngine();

      const unsubProgress = engines.export.onProgress((progress) => {
        set({ exportProgress: progress });
      });

      set({ exporting: true, exportProgress: 0 });

      try {
        const blob = await engines.export.export(composition, options, assetResolver);
        set({ exporting: false, exportProgress: 1 });
        return blob;
      } catch (error) {
        set({ exporting: false, exportProgress: 0 });
        throw error;
      } finally {
        unsubProgress();
        engines.export = null;
      }
    },

    abortExport(): void {
      if (engines.export) {
        engines.export.abort();
      }
    },

    // Internal
    _assetResolver: assetResolver,
    _compositorType: compositorType,
  }));

  return store;
}
