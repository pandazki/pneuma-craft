import { describe, it, expect } from 'vitest';
import { getLineage, getAncestors, getVariants, getRoots, getOperationsByActor, getTree } from '../src/provenance-queries.js';
import { createInitialState, applyEvent } from '../src/state.js';
import type { Event, Asset } from '../src/types.js';

function makeEvent(type: string, payload: Record<string, unknown>, id = 'e'): Event {
  return { id, commandId: 'c', actor: 'human', timestamp: 1000, type, payload };
}

// Build a graph: root -> child1, root -> child2, child1 -> grandchild
function buildGraphState() {
  const root: Asset = { id: 'root', type: 'image', uri: '/r.png', name: 'Root', metadata: {}, createdAt: 1000 };
  const child1: Asset = { id: 'c1', type: 'image', uri: '/c1.png', name: 'Child 1', metadata: {}, createdAt: 2000 };
  const child2: Asset = { id: 'c2', type: 'image', uri: '/c2.png', name: 'Child 2', metadata: {}, createdAt: 3000 };
  const grandchild: Asset = { id: 'gc', type: 'image', uri: '/gc.png', name: 'Grandchild', metadata: {}, createdAt: 4000 };

  const uploadOp = { type: 'upload' as const, actor: 'human' as const, timestamp: 1000 };
  const deriveOp = { type: 'derive' as const, actor: 'agent' as const, agentId: 'ai-1', timestamp: 2000 };

  let state = createInitialState();
  state = applyEvent(state, makeEvent('asset:registered', { asset: root }, 'e1'));
  state = applyEvent(state, makeEvent('asset:registered', { asset: child1 }, 'e2'));
  state = applyEvent(state, makeEvent('asset:registered', { asset: child2 }, 'e3'));
  state = applyEvent(state, makeEvent('asset:registered', { asset: grandchild }, 'e4'));
  state = applyEvent(state, makeEvent('provenance:root-set', { assetId: 'root', operation: uploadOp, edgeId: 'edge-root' }, 'e5'));
  state = applyEvent(state, makeEvent('provenance:linked', { edgeId: 'edge-1', fromAssetId: 'root', toAssetId: 'c1', operation: deriveOp }, 'e6'));
  state = applyEvent(state, makeEvent('provenance:linked', { edgeId: 'edge-2', fromAssetId: 'root', toAssetId: 'c2', operation: { ...deriveOp, actor: 'human' as const } }, 'e7'));
  state = applyEvent(state, makeEvent('provenance:linked', { edgeId: 'edge-3', fromAssetId: 'c1', toAssetId: 'gc', operation: deriveOp }, 'e8'));
  return state;
}

describe('getLineage (primary parent chain)', () => {
  it('returns first-parent ancestor chain from asset to root', () => {
    const state = buildGraphState();
    const lineage = getLineage(state, 'gc');
    expect(lineage.map(a => a.id)).toEqual(['c1', 'root']);
  });
  it('returns empty for root asset', () => {
    expect(getLineage(buildGraphState(), 'root')).toEqual([]);
  });
  it('returns empty for unknown asset', () => {
    expect(getLineage(buildGraphState(), 'unknown')).toEqual([]);
  });
});

describe('getAncestors (all ancestors in DAG)', () => {
  it('returns all ancestors via BFS', () => {
    const ancestors = getAncestors(buildGraphState(), 'gc');
    expect(ancestors.map(a => a.id).sort()).toEqual(['c1', 'root']);
  });
  it('returns empty for root asset', () => {
    expect(getAncestors(buildGraphState(), 'root')).toEqual([]);
  });
  it('handles multi-parent nodes (composite)', () => {
    const merged: Asset = { id: 'merged', type: 'image', uri: '/m.png', name: 'Merged', metadata: {}, createdAt: 5000 };
    const compositeOp = { type: 'composite' as const, actor: 'agent' as const, timestamp: 5000 };
    let state = buildGraphState();
    state = applyEvent(state, makeEvent('asset:registered', { asset: merged }, 'e9'));
    state = applyEvent(state, makeEvent('provenance:linked', { edgeId: 'edge-4', fromAssetId: 'c1', toAssetId: 'merged', operation: compositeOp }, 'e10'));
    state = applyEvent(state, makeEvent('provenance:linked', { edgeId: 'edge-5', fromAssetId: 'c2', toAssetId: 'merged', operation: compositeOp }, 'e11'));
    const ancestors = getAncestors(state, 'merged');
    expect(ancestors.map(a => a.id).sort()).toEqual(['c1', 'c2', 'root']);
  });
});

describe('getVariants', () => {
  it('returns direct children', () => {
    const variants = getVariants(buildGraphState(), 'root');
    expect(variants.map(a => a.id).sort()).toEqual(['c1', 'c2']);
  });
  it('returns empty for leaf', () => {
    expect(getVariants(buildGraphState(), 'gc')).toEqual([]);
  });
});

describe('getRoots', () => {
  it('returns assets with no parents', () => {
    const roots = getRoots(buildGraphState());
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('root');
  });
});

describe('getOperationsByActor', () => {
  it('filters edges by actor', () => {
    const agentOps = getOperationsByActor(buildGraphState(), 'agent');
    expect(agentOps.length).toBeGreaterThanOrEqual(2);
    agentOps.forEach(edge => expect(edge.operation.actor).toBe('agent'));
  });
});

describe('getTree', () => {
  it('returns full subtree from root', () => {
    const tree = getTree(buildGraphState(), 'root');
    expect(tree).toBeDefined();
    expect(tree!.assetId).toBe('root');
    expect(tree!.children).toHaveLength(2);
    const c1Node = tree!.children.find(c => c.assetId === 'c1');
    expect(c1Node).toBeDefined();
    expect(c1Node!.children).toHaveLength(1);
    expect(c1Node!.children[0].assetId).toBe('gc');
  });
  it('returns null for unknown asset', () => {
    expect(getTree(buildGraphState(), 'unknown')).toBeNull();
  });
});
