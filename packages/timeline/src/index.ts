// ── Types ───────────────────────────────────────────────────────────────
export type {
  CompositionSettings,
  TrackType,
  Track,
  Clip,
  PreviewFrame,
  Transition,
  Composition,
  PlaybackClock,
  ResolvedClip,
  ResolvedPreviewFrame,
  ResolvedFrame,
  CompositionCommand,
} from './types.js';

// ── TimelineCore facade ─────────────────────────────────────────────────
export { createTimelineCore } from './timeline-core.js';
export type { TimelineCore } from './timeline-core.js';

// ── State ───────────────────────────────────────────────────────────────
export { createInitialCompositionState, applyCompositionEvent } from './state.js';
export type { CompositionState } from './state.js';

// ── Command handler ─────────────────────────────────────────────────────
export { handleCompositionCommand, buildSetPreviewFrameCommand } from './command-handler.js';

// ── Typed events ────────────────────────────────────────────────────────
export { asCompositionEvent } from './events.js';
export type { CompositionEvent } from './events.js';

// ── Clip resolution ─────────────────────────────────────────────────────
export { resolveFrame } from './resolve-frame.js';

// ── Composition helpers ─────────────────────────────────────────────────
export {
  computeDuration,
  recomputeDuration,
  addClipToTrack,
  removeClipFromComposition,
  updateClipInComposition,
  findClipById,
  findTrackByClipId,
  addPreviewFrame,
  removePreviewFrameFromComposition,
  updatePreviewFrameInComposition,
  findPreviewFrameById,
  findGreatestPreviewFrameAtOrBefore,
} from './composition-helpers.js';

// ── Undo ────────────────────────────────────────────────────────────────
export { invertCompositionEvent } from './undo.js';
