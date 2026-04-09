import type { Asset, AssetMetadata, Operation, Selection, ProvenanceEdge } from './types.js';

// ── Asset events ────────────────────────────────────────────────────────

interface AssetRegisteredEvent {
  readonly type: 'asset:registered';
  readonly payload: { readonly asset: Asset };
}

interface AssetRemovedEvent {
  readonly type: 'asset:removed';
  readonly payload: { readonly assetId: string; readonly asset: Asset };
}

interface AssetMetadataUpdatedEvent {
  readonly type: 'asset:metadata-updated';
  readonly payload: {
    readonly assetId: string;
    readonly metadata: Partial<AssetMetadata>;
    readonly previousMetadata: AssetMetadata;
  };
}

interface AssetTaggedEvent {
  readonly type: 'asset:tagged';
  readonly payload: {
    readonly assetId: string;
    readonly tags: string[];
    readonly previousTags: string[] | undefined;
  };
}

// ── Provenance events ───────────────────────────────────────────────────

interface ProvenanceRootSetEvent {
  readonly type: 'provenance:root-set';
  readonly payload: {
    readonly assetId: string;
    readonly operation: Operation;
    readonly edgeId: string;
  };
}

interface ProvenanceLinkedEvent {
  readonly type: 'provenance:linked';
  readonly payload: {
    readonly edgeId: string;
    readonly fromAssetId: string | null;
    readonly toAssetId: string;
    readonly operation: Operation;
  };
}

interface ProvenanceUnlinkedEvent {
  readonly type: 'provenance:unlinked';
  readonly payload: {
    readonly edgeId: string;
    readonly edge: ProvenanceEdge;
  };
}

// ── Selection events ────────────────────────────────────────────────────

interface SelectionSetEvent {
  readonly type: 'selection:set';
  readonly payload: {
    readonly selection: Selection;
    readonly previousSelection: Selection;
  };
}

interface SelectionClearedEvent {
  readonly type: 'selection:cleared';
  readonly payload: {
    readonly previousSelection: Selection;
  };
}

// ── Union ───────────────────────────────────────────────────────────────

export type CoreEvent =
  | AssetRegisteredEvent
  | AssetRemovedEvent
  | AssetMetadataUpdatedEvent
  | AssetTaggedEvent
  | ProvenanceRootSetEvent
  | ProvenanceLinkedEvent
  | ProvenanceUnlinkedEvent
  | SelectionSetEvent
  | SelectionClearedEvent;

/** Narrow a generic Event to a CoreEvent for type-safe payload access. */
export function asCoreEvent(event: { type: string; payload: Record<string, unknown> }): CoreEvent {
  return event as CoreEvent;
}
