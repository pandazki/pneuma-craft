// ── Provider ───────────────────────────────────────────────────────────
export { PneumaCraftProvider } from './provider.js';
export type { PneumaCraftProviderProps } from './provider.js';

// ── Store ──────────────────────────────────────────────────────────────
export { createPneumaCraftStore } from './store.js';
export type { PneumaCraftStore, PneumaCraftStoreApi } from './store.js';

// ── Context ────────────────────────────────────────────────────────────
export { usePneumaCraftStore } from './context.js';

// ── Hooks ──────────────────────────────────────────────────────────────
export {
  useAssets, useAsset, useComposition, useSelection,
  useLineage, useVariants, useEventLog,
  useDispatch, useUndo, usePlayback, useExport,
} from './hooks/index.js';
export type { EventLogFilter, UndoState, PlaybackHookState, ExportHookState } from './hooks/index.js';

// ── Headless Components ────────────────────────────────────────────────
export { PreviewRoot, TimelineRoot, AssetLibraryRoot, ProvenanceTreeRoot } from './headless/index.js';
export type {
  PreviewRootProps, PreviewState,
  TimelineRootProps, TimelineState,
  AssetLibraryRootProps, AssetLibraryState,
  ProvenanceTreeRootProps, ProvenanceTreeState, ProvenanceTreeNode,
} from './headless/index.js';

// ── Re-exported types ──────────────────────────────────────────────────
export type { Asset, AssetType, Actor, Selection, Event, CoreCommand } from '@pneuma-craft/core';
export type { Composition, Track, Clip, CompositionSettings, CompositionCommand } from '@pneuma-craft/timeline';
export type { PlaybackState, ExportOptions, AssetResolver } from '@pneuma-craft/video';
