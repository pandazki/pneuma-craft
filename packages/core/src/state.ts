import type {
  PneumaCraftCoreState,
  Event,
  ProvenanceNode,
  ProvenanceEdge,
} from './types.js';
import { asCoreEvent } from './events.js';

export function createInitialState(): PneumaCraftCoreState {
  return {
    registry: new Map(),
    provenance: {
      nodes: new Map(),
      edges: new Map(),
    },
    selection: { type: 'none', ids: [] },
  };
}

/** Check if a node has any remaining edges in the graph. */
function nodeHasEdges(nodeAssetId: string, edges: Map<string, ProvenanceEdge>): boolean {
  for (const edge of edges.values()) {
    if (edge.fromAssetId === nodeAssetId || edge.toAssetId === nodeAssetId) return true;
  }
  return false;
}

export function applyEvent(state: PneumaCraftCoreState, event: Event): PneumaCraftCoreState {
  const e = asCoreEvent(event);

  switch (e.type) {
    case 'asset:registered': {
      const registry = new Map(state.registry);
      registry.set(e.payload.asset.id, e.payload.asset);
      return { ...state, registry };
    }

    case 'asset:removed': {
      const registry = new Map(state.registry);
      registry.delete(e.payload.assetId);
      return { ...state, registry };
    }

    case 'asset:metadata-updated': {
      const existing = state.registry.get(e.payload.assetId);
      if (!existing) return state;
      const updated = {
        ...existing,
        metadata: { ...existing.metadata, ...e.payload.metadata },
      };
      const registry = new Map(state.registry);
      registry.set(e.payload.assetId, updated);
      return { ...state, registry };
    }

    case 'asset:tagged': {
      const existing = state.registry.get(e.payload.assetId);
      if (!existing) return state;
      const updated = { ...existing, tags: e.payload.tags };
      const registry = new Map(state.registry);
      registry.set(e.payload.assetId, updated);
      return { ...state, registry };
    }

    case 'asset:status-changed': {
      const existing = state.registry.get(e.payload.assetId);
      if (!existing) return state;
      const updated = { ...existing, status: e.payload.status };
      const registry = new Map(state.registry);
      registry.set(e.payload.assetId, updated);
      return { ...state, registry };
    }

    case 'provenance:root-set': {
      const { assetId, operation, edgeId } = e.payload;
      const nodes = new Map(state.provenance.nodes);
      const edges = new Map(state.provenance.edges);

      // Merge with existing node if present (preserve parentIds/childIds from prior links)
      const existing = nodes.get(assetId);
      const node: ProvenanceNode = {
        assetId,
        parentIds: existing?.parentIds ?? [],
        childIds: existing?.childIds ?? [],
        rootOperation: operation,
      };
      nodes.set(assetId, node);

      const edge: ProvenanceEdge = {
        id: edgeId,
        fromAssetId: null,
        toAssetId: assetId,
        operation,
      };
      edges.set(edgeId, edge);

      return { ...state, provenance: { nodes, edges } };
    }

    case 'provenance:linked': {
      const { edgeId, fromAssetId, toAssetId, operation } = e.payload;
      const nodes = new Map(state.provenance.nodes);
      const edges = new Map(state.provenance.edges);

      const edge: ProvenanceEdge = { id: edgeId, fromAssetId, toAssetId, operation };
      edges.set(edgeId, edge);

      if (fromAssetId !== null) {
        const parentNode = nodes.get(fromAssetId);
        if (parentNode) {
          nodes.set(fromAssetId, {
            ...parentNode,
            childIds: [...parentNode.childIds, toAssetId],
          });
        } else {
          // Create node for unseen parent so getVariants/getTree work
          nodes.set(fromAssetId, {
            assetId: fromAssetId,
            parentIds: [],
            childIds: [toAssetId],
            rootOperation: operation,
          });
        }
      }

      const existingChild = nodes.get(toAssetId);
      if (existingChild) {
        nodes.set(toAssetId, {
          ...existingChild,
          parentIds: fromAssetId !== null
            ? [...existingChild.parentIds, fromAssetId]
            : existingChild.parentIds,
        });
      } else {
        nodes.set(toAssetId, {
          assetId: toAssetId,
          parentIds: fromAssetId !== null ? [fromAssetId] : [],
          childIds: [],
          rootOperation: operation,
        });
      }

      return { ...state, provenance: { nodes, edges } };
    }

    case 'provenance:unlinked': {
      const { edgeId, edge: removedEdge } = e.payload;
      const nodes = new Map(state.provenance.nodes);
      const edges = new Map(state.provenance.edges);

      edges.delete(edgeId);

      if (removedEdge.fromAssetId !== null) {
        const parentNode = nodes.get(removedEdge.fromAssetId);
        if (parentNode) {
          const updated = {
            ...parentNode,
            childIds: parentNode.childIds.filter(id => id !== removedEdge.toAssetId),
          };
          // Remove orphan node (no parents, no children, no remaining edges)
          if (updated.parentIds.length === 0 && updated.childIds.length === 0
              && !nodeHasEdges(removedEdge.fromAssetId, edges)) {
            nodes.delete(removedEdge.fromAssetId);
          } else {
            nodes.set(removedEdge.fromAssetId, updated);
          }
        }
      }

      const childNode = nodes.get(removedEdge.toAssetId);
      if (childNode) {
        const updated = {
          ...childNode,
          parentIds: removedEdge.fromAssetId !== null
            ? childNode.parentIds.filter(id => id !== removedEdge.fromAssetId)
            : childNode.parentIds,
        };
        // Remove orphan root node (created via root-set, now with no remaining edges).
        // Only applies when the removed edge was a root edge (fromAssetId === null).
        if (removedEdge.fromAssetId === null
            && updated.parentIds.length === 0 && updated.childIds.length === 0
            && !nodeHasEdges(removedEdge.toAssetId, edges)) {
          nodes.delete(removedEdge.toAssetId);
        } else {
          nodes.set(removedEdge.toAssetId, updated);
        }
      }

      return { ...state, provenance: { nodes, edges } };
    }

    case 'selection:set': {
      return { ...state, selection: e.payload.selection };
    }

    case 'selection:cleared': {
      return { ...state, selection: { type: 'none', ids: [] } };
    }

    default:
      return state;
  }
}

// Note: projectState is a cold-path function for state recovery.
// For performance-sensitive use, prefer CraftCore's incremental applyEvent via dispatch().
export function projectState(events: readonly Event[]): PneumaCraftCoreState {
  return events.reduce<PneumaCraftCoreState>(applyEvent, createInitialState());
}
