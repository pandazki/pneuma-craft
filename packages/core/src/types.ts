// ── Asset Registry ──────────────────────────────────────────────────────

export type AssetType = 'video' | 'image' | 'audio' | 'text';

/**
 * Lifecycle status for async AIGC assets.
 *
 * - `ready`  — default; asset is fully realized (uri points to a valid file).
 * - `pending` — queued for generation, not yet running.
 * - `generating` — provider job in flight; uri may be empty or a placeholder.
 * - `failed` — generation attempted and errored; uri is typically empty.
 *
 * Absence of the field is equivalent to `ready` (backward-compat for existing consumers).
 */
export type AssetStatus = 'pending' | 'generating' | 'ready' | 'failed';

export interface AssetMetadata {
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  codec?: string;
  sampleRate?: number;
  channels?: number;
  fps?: number;
}

export interface Asset {
  readonly id: string;
  readonly type: AssetType;
  readonly uri: string;
  readonly name: string;
  readonly metadata: AssetMetadata;
  readonly createdAt: number;
  readonly tags?: string[];
  readonly status?: AssetStatus;
}

// ── Provenance Graph ────────────────────────────────────────────────────

export type Actor = 'human' | 'agent';

export type OperationType =
  | 'upload'
  | 'import'
  | 'generate'
  | 'derive'
  | 'select'
  | 'composite';

export interface Operation {
  readonly type: OperationType;
  readonly actor: Actor;
  readonly agentId?: string;
  readonly params?: Record<string, unknown>;
  readonly label?: string;
  readonly timestamp: number;
}

export interface ProvenanceEdge {
  readonly id: string;
  readonly fromAssetId: string | null;
  readonly toAssetId: string;
  readonly operation: Operation;
}

export interface ProvenanceNode {
  readonly assetId: string;
  readonly parentIds: string[];
  readonly childIds: string[];
  readonly rootOperation: Operation;
}

// ── Selection ───────────────────────────────────────────────────────────

export interface Selection {
  readonly type: 'asset' | 'clip' | 'track' | 'time-range' | 'none';
  readonly ids: string[];
  readonly timeRange?: { start: number; end: number };
}

// ── Event System ────────────────────────────────────────────────────────

export interface Event {
  readonly id: string;
  readonly commandId: string;
  readonly actor: Actor;
  readonly timestamp: number;
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

// ── Commands ────────────────────────────────────────────────────────────

export type AssetCommand =
  | { type: 'asset:register'; asset: Omit<Asset, 'id' | 'createdAt'> }
  | { type: 'asset:remove'; assetId: string }
  | { type: 'asset:update-metadata'; assetId: string; metadata: Partial<AssetMetadata> }
  | { type: 'asset:tag'; assetId: string; tags: string[] }
  | { type: 'asset:set-status'; assetId: string; status: AssetStatus };

export type ProvenanceCommand =
  | { type: 'provenance:link'; fromAssetId: string | null; toAssetId: string; operation: Operation }
  | { type: 'provenance:set-root'; assetId: string; operation: Operation }
  | { type: 'provenance:unlink'; edgeId: string };

export type SelectionCommand =
  | { type: 'selection:set'; selection: Selection }
  | { type: 'selection:clear' };

export type CoreCommand = AssetCommand | ProvenanceCommand | SelectionCommand;

export interface CommandEnvelope<C = CoreCommand> {
  readonly id: string;
  readonly actor: Actor;
  readonly timestamp: number;
  readonly command: C;
}

// ── State ───────────────────────────────────────────────────────────────

export interface PneumaCraftCoreState {
  readonly registry: Map<string, Asset>;
  readonly provenance: {
    readonly nodes: Map<string, ProvenanceNode>;
    readonly edges: Map<string, ProvenanceEdge>;
  };
  readonly selection: Selection;
}
