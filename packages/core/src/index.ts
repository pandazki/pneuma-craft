// ── Types ───────────────────────────────────────────────────────────────
export type {
  Asset,
  AssetType,
  AssetMetadata,
  Actor,
  Operation,
  OperationType,
  ProvenanceEdge,
  ProvenanceNode,
  Selection,
  Event,
  AssetCommand,
  ProvenanceCommand,
  SelectionCommand,
  CoreCommand,
  CommandEnvelope,
  PneumaCraftCoreState,
} from './types.js';

// ── Core facade ─────────────────────────────────────────────────────────
export { createCore } from './core.js';
export type { CraftCore } from './core.js';

// ── EventStore ──────────────────────────────────────────────────────────
export { createEventStore } from './event-store.js';
export type { EventStore } from './event-store.js';

// ── State projection ────────────────────────────────────────────────────
export { createInitialState, applyEvent, projectState } from './state.js';

// ── Command handler ─────────────────────────────────────────────────────
export { handleCommand, CommandValidationError } from './command-handler.js';

// ── Typed events ────────────────────────────────────────────────────────
export { asCoreEvent } from './events.js';
export type { CoreEvent } from './events.js';

// ── Asset queries ───────────────────────────────────────────────────────
export { getAssetById, getAssetsByType, searchAssets } from './asset-queries.js';

// ── Provenance queries ──────────────────────────────────────────────────
export {
  getLineage,
  getAncestors,
  getVariants,
  getRoots,
  getOperationsByActor,
  getTree,
} from './provenance-queries.js';
export type { ProvenanceTreeNode } from './provenance-queries.js';

// ── Undo manager ────────────────────────────────────────────────────────
export { createUndoManager, invertCoreEvent } from './undo-manager.js';
export type { UndoManager } from './undo-manager.js';

// ── ID generation ───────────────────────────────────────────────────────
export { generateId } from './id.js';
