// React bindings — components and hooks will be added here
// Re-export core types for convenience
export type {
  Asset,
  AssetType,
  Actor,
  Selection,
  Event,
  CommandEnvelope,
} from '@pneuma-craft/core';

export type {
  Composition,
  Track,
  Clip,
  PlaybackClock,
} from '@pneuma-craft/timeline';

// ── Store ──────────────────────────────────────────────────────────────
export { createPneumaCraftStore } from './store.js';
export type { PneumaCraftStore, PneumaCraftStoreApi } from './store.js';

// ── Context + Provider ─────────────────────────────────────────────────
export { PneumaCraftContext, usePneumaCraftStore } from './context.js';
export { PneumaCraftProvider } from './provider.js';
export type { PneumaCraftProviderProps } from './provider.js';
