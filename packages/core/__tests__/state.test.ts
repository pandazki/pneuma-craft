import { describe, it, expect } from 'vitest';
import { createInitialState, applyEvent, projectState } from '../src/state.js';
import type { Event, Asset, Selection } from '../src/types.js';

function makeEvent(type: string, payload: Record<string, unknown>, overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-1',
    commandId: 'cmd-1',
    actor: 'human',
    timestamp: 1000,
    type,
    payload,
    ...overrides,
  };
}

const sampleAsset: Asset = {
  id: 'asset-1',
  type: 'video',
  uri: '/test.mp4',
  name: 'Test Video',
  metadata: { width: 1920, height: 1080 },
  createdAt: 1000,
};

describe('createInitialState', () => {
  it('returns empty state', () => {
    const state = createInitialState();
    expect(state.registry.size).toBe(0);
    expect(state.provenance.nodes.size).toBe(0);
    expect(state.provenance.edges.size).toBe(0);
    expect(state.selection).toEqual({ type: 'none', ids: [] });
  });
});

describe('applyEvent — asset events', () => {
  it('asset:registered adds asset to registry', () => {
    const state = createInitialState();
    const next = applyEvent(state, makeEvent('asset:registered', { asset: sampleAsset }));
    expect(next.registry.get('asset-1')).toEqual(sampleAsset);
  });

  it('asset:removed removes asset from registry', () => {
    let state = createInitialState();
    state = applyEvent(state, makeEvent('asset:registered', { asset: sampleAsset }));
    state = applyEvent(state, makeEvent('asset:removed', { assetId: 'asset-1', asset: sampleAsset }));
    expect(state.registry.has('asset-1')).toBe(false);
  });

  it('asset:metadata-updated merges metadata', () => {
    let state = createInitialState();
    state = applyEvent(state, makeEvent('asset:registered', { asset: sampleAsset }));
    state = applyEvent(state, makeEvent('asset:metadata-updated', {
      assetId: 'asset-1',
      metadata: { fps: 30 },
      previousMetadata: sampleAsset.metadata,
    }));
    const asset = state.registry.get('asset-1')!;
    expect(asset.metadata.fps).toBe(30);
    expect(asset.metadata.width).toBe(1920);
  });

  it('asset:tagged replaces tags', () => {
    let state = createInitialState();
    state = applyEvent(state, makeEvent('asset:registered', { asset: sampleAsset }));
    state = applyEvent(state, makeEvent('asset:tagged', {
      assetId: 'asset-1',
      tags: ['hero', 'intro'],
      previousTags: undefined,
    }));
    expect(state.registry.get('asset-1')!.tags).toEqual(['hero', 'intro']);
  });
});

describe('asset:status-changed projection', () => {
  function stateWithAsset(asset: Asset) {
    return applyEvent(createInitialState(), makeEvent('asset:registered', { asset }));
  }

  it('updates the status field on the existing asset', () => {
    const state = stateWithAsset({ ...sampleAsset, status: 'generating' });
    const nextState = applyEvent(state, {
      id: 'evt-1', commandId: 'cmd-1', actor: 'human', timestamp: 2000,
      type: 'asset:status-changed',
      payload: { assetId: 'asset-1', status: 'ready', previousStatus: 'generating' },
    });
    const updated = nextState.registry.get('asset-1');
    expect(updated?.status).toBe('ready');
    expect(updated?.uri).toBe(sampleAsset.uri);
    expect(updated?.metadata).toEqual(sampleAsset.metadata);
  });

  it('sets status on an asset that had none', () => {
    const state = stateWithAsset(sampleAsset);
    const nextState = applyEvent(state, {
      id: 'evt-1', commandId: 'cmd-1', actor: 'human', timestamp: 2000,
      type: 'asset:status-changed',
      payload: { assetId: 'asset-1', status: 'failed', previousStatus: undefined },
    });
    expect(nextState.registry.get('asset-1')?.status).toBe('failed');
  });

  it('is a no-op if the asset does not exist', () => {
    const state = createInitialState();
    const nextState = applyEvent(state, {
      id: 'evt-1', commandId: 'cmd-1', actor: 'human', timestamp: 2000,
      type: 'asset:status-changed',
      payload: { assetId: 'ghost', status: 'ready', previousStatus: undefined },
    });
    expect(nextState).toBe(state);
  });
});

describe('applyEvent — provenance events', () => {
  it('provenance:root-set creates node and edge', () => {
    let state = createInitialState();
    state = applyEvent(state, makeEvent('asset:registered', { asset: sampleAsset }));
    state = applyEvent(state, makeEvent('provenance:root-set', {
      assetId: 'asset-1',
      operation: { type: 'upload', actor: 'human', timestamp: 1000 },
      edgeId: 'edge-1',
    }));

    const node = state.provenance.nodes.get('asset-1');
    expect(node).toBeDefined();
    expect(node!.parentIds).toEqual([]);
    expect(node!.rootOperation.type).toBe('upload');

    const edge = state.provenance.edges.get('edge-1');
    expect(edge).toBeDefined();
    expect(edge!.fromAssetId).toBeNull();
    expect(edge!.toAssetId).toBe('asset-1');
  });

  it('provenance:linked creates edge and updates nodes', () => {
    const parentAsset: Asset = { ...sampleAsset, id: 'parent-1', name: 'Parent' };
    const childAsset: Asset = { ...sampleAsset, id: 'child-1', name: 'Child' };
    const op = { type: 'derive' as const, actor: 'agent' as const, timestamp: 2000 };

    let state = createInitialState();
    state = applyEvent(state, makeEvent('asset:registered', { asset: parentAsset }));
    state = applyEvent(state, makeEvent('provenance:root-set', {
      assetId: 'parent-1', operation: { type: 'upload', actor: 'human', timestamp: 1000 }, edgeId: 'e0',
    }));
    state = applyEvent(state, makeEvent('asset:registered', { asset: childAsset }));
    state = applyEvent(state, makeEvent('provenance:linked', {
      edgeId: 'edge-2', fromAssetId: 'parent-1', toAssetId: 'child-1', operation: op,
    }));

    const parentNode = state.provenance.nodes.get('parent-1')!;
    expect(parentNode.childIds).toContain('child-1');

    const childNode = state.provenance.nodes.get('child-1')!;
    expect(childNode.parentIds).toContain('parent-1');
    expect(childNode.rootOperation.type).toBe('derive');

    expect(state.provenance.edges.has('edge-2')).toBe(true);
  });

  it('provenance:root-set preserves existing node relationships', () => {
    // Link first, then set-root — should not wipe childIds
    const parentAsset: Asset = { ...sampleAsset, id: 'p1', name: 'Parent' };
    const childAsset: Asset = { ...sampleAsset, id: 'c1', name: 'Child' };
    const deriveOp = { type: 'derive' as const, actor: 'agent' as const, timestamp: 2000 };
    const uploadOp = { type: 'upload' as const, actor: 'human' as const, timestamp: 1000 };

    let state = createInitialState();
    state = applyEvent(state, makeEvent('asset:registered', { asset: parentAsset }));
    state = applyEvent(state, makeEvent('asset:registered', { asset: childAsset }));
    // Link before set-root
    state = applyEvent(state, makeEvent('provenance:linked', {
      edgeId: 'e-link', fromAssetId: 'p1', toAssetId: 'c1', operation: deriveOp,
    }));
    // Now set-root on parent — should NOT wipe childIds
    state = applyEvent(state, makeEvent('provenance:root-set', {
      assetId: 'p1', operation: uploadOp, edgeId: 'e-root',
    }));

    const node = state.provenance.nodes.get('p1')!;
    expect(node.childIds).toContain('c1');
    expect(node.rootOperation.type).toBe('upload');
  });

  it('provenance:linked creates parent node if it does not exist', () => {
    const parentAsset: Asset = { ...sampleAsset, id: 'p1', name: 'Parent' };
    const childAsset: Asset = { ...sampleAsset, id: 'c1', name: 'Child' };
    const deriveOp = { type: 'derive' as const, actor: 'agent' as const, timestamp: 2000 };

    let state = createInitialState();
    state = applyEvent(state, makeEvent('asset:registered', { asset: parentAsset }));
    state = applyEvent(state, makeEvent('asset:registered', { asset: childAsset }));
    // Link without prior set-root on parent
    state = applyEvent(state, makeEvent('provenance:linked', {
      edgeId: 'e-link', fromAssetId: 'p1', toAssetId: 'c1', operation: deriveOp,
    }));

    // Parent node should exist with c1 as child
    const parentNode = state.provenance.nodes.get('p1');
    expect(parentNode).toBeDefined();
    expect(parentNode!.childIds).toContain('c1');
  });

  it('provenance:unlinked removes edge and updates nodes', () => {
    const parentAsset: Asset = { ...sampleAsset, id: 'p1', name: 'P' };
    const childAsset: Asset = { ...sampleAsset, id: 'c1', name: 'C' };
    const op = { type: 'derive' as const, actor: 'agent' as const, timestamp: 2000 };

    let state = createInitialState();
    state = applyEvent(state, makeEvent('asset:registered', { asset: parentAsset }));
    state = applyEvent(state, makeEvent('provenance:root-set', {
      assetId: 'p1', operation: { type: 'upload', actor: 'human', timestamp: 1000 }, edgeId: 'e0',
    }));
    state = applyEvent(state, makeEvent('asset:registered', { asset: childAsset }));
    state = applyEvent(state, makeEvent('provenance:linked', {
      edgeId: 'edge-link', fromAssetId: 'p1', toAssetId: 'c1', operation: op,
    }));
    state = applyEvent(state, makeEvent('provenance:unlinked', {
      edgeId: 'edge-link',
      edge: { id: 'edge-link', fromAssetId: 'p1', toAssetId: 'c1', operation: op },
    }));

    expect(state.provenance.edges.has('edge-link')).toBe(false);
    expect(state.provenance.nodes.get('p1')!.childIds).not.toContain('c1');
    expect(state.provenance.nodes.get('c1')!.parentIds).not.toContain('p1');
  });

  it('provenance:unlinked removes orphan nodes (no remaining edges)', () => {
    let state = createInitialState();
    state = applyEvent(state, makeEvent('asset:registered', { asset: sampleAsset }));
    state = applyEvent(state, makeEvent('provenance:root-set', {
      assetId: 'asset-1',
      operation: { type: 'upload', actor: 'human', timestamp: 1000 },
      edgeId: 'edge-root',
    }));
    expect(state.provenance.nodes.has('asset-1')).toBe(true);

    state = applyEvent(state, makeEvent('provenance:unlinked', {
      edgeId: 'edge-root',
      edge: { id: 'edge-root', fromAssetId: null, toAssetId: 'asset-1',
        operation: { type: 'upload', actor: 'human', timestamp: 1000 } },
    }));
    expect(state.provenance.nodes.has('asset-1')).toBe(false);
    expect(state.provenance.edges.has('edge-root')).toBe(false);
  });
});

describe('applyEvent — selection events', () => {
  it('selection:set updates selection', () => {
    const selection: Selection = { type: 'asset', ids: ['asset-1'] };
    const state = applyEvent(createInitialState(), makeEvent('selection:set', {
      selection,
      previousSelection: { type: 'none', ids: [] },
    }));
    expect(state.selection).toEqual(selection);
  });

  it('selection:cleared resets to none', () => {
    let state = createInitialState();
    state = applyEvent(state, makeEvent('selection:set', {
      selection: { type: 'asset', ids: ['a1'] },
      previousSelection: { type: 'none', ids: [] },
    }));
    state = applyEvent(state, makeEvent('selection:cleared', {
      previousSelection: { type: 'asset', ids: ['a1'] },
    }));
    expect(state.selection).toEqual({ type: 'none', ids: [] });
  });
});

describe('projectState', () => {
  it('folds multiple events into state', () => {
    const a1: Asset = { ...sampleAsset, id: 'a1', name: 'One' };
    const a2: Asset = { ...sampleAsset, id: 'a2', name: 'Two' };

    const events: Event[] = [
      makeEvent('asset:registered', { asset: a1 }, { id: 'e1' }),
      makeEvent('asset:registered', { asset: a2 }, { id: 'e2' }),
      makeEvent('selection:set', {
        selection: { type: 'asset', ids: ['a1'] },
        previousSelection: { type: 'none', ids: [] },
      }, { id: 'e3' }),
    ];

    const state = projectState(events);
    expect(state.registry.size).toBe(2);
    expect(state.selection.ids).toEqual(['a1']);
  });
});
