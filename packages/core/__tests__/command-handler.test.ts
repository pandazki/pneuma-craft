import { describe, it, expect } from 'vitest';
import { handleCommand, CommandValidationError } from '../src/command-handler.js';
import { createInitialState } from '../src/state.js';
import type { CommandEnvelope, Asset, PneumaCraftCoreState, ProvenanceEdge, ProvenanceNode } from '../src/types.js';

function makeEnvelope(command: CommandEnvelope['command']): CommandEnvelope {
  return { id: 'cmd-1', actor: 'human', timestamp: 1000, command };
}

function stateWithAsset(asset: Asset): PneumaCraftCoreState {
  const state = createInitialState();
  const registry = new Map(state.registry);
  registry.set(asset.id, asset);
  return { ...state, registry };
}

const sampleAsset: Asset = {
  id: 'asset-1', type: 'video', uri: '/test.mp4', name: 'Test',
  metadata: { width: 1920, height: 1080 }, createdAt: 1000,
};

describe('handleCommand — asset commands', () => {
  describe('asset:register', () => {
    it('produces asset:registered event with generated id', () => {
      const state = createInitialState();
      const events = handleCommand(state, makeEnvelope({
        type: 'asset:register',
        asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: { width: 1920 } },
      }));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('asset:registered');
      expect(events[0].commandId).toBe('cmd-1');
      expect(events[0].actor).toBe('human');
      const asset = events[0].payload.asset as Asset;
      expect(asset.id).toBeDefined();
      expect(asset.id.length).toBeGreaterThan(0);
      expect(asset.uri).toBe('/test.mp4');
      expect(asset.createdAt).toBeDefined();
    });

    it('uses the provided id when supplied', () => {
      const state = createInitialState();
      const events = handleCommand(state, makeEnvelope({
        type: 'asset:register',
        asset: {
          id: 'my-explicit-id',
          type: 'image',
          uri: '/test.png',
          name: 'Test',
          metadata: { width: 256 },
        },
      }));
      expect(events).toHaveLength(1);
      const asset = events[0].payload.asset as Asset;
      expect(asset.id).toBe('my-explicit-id');
      expect(asset.createdAt).toBe(1000); // from envelope timestamp
    });

    it('throws when registering with a duplicate explicit id', () => {
      const existing: Asset = { ...sampleAsset, id: 'dup-id' };
      const state = stateWithAsset(existing);
      expect(() => handleCommand(state, makeEnvelope({
        type: 'asset:register',
        asset: {
          id: 'dup-id',
          type: 'video',
          uri: '/other.mp4',
          name: 'Other',
          metadata: {},
        },
      }))).toThrow(CommandValidationError);
    });
  });

  describe('asset:remove', () => {
    it('produces asset:removed event', () => {
      const state = stateWithAsset(sampleAsset);
      const events = handleCommand(state, makeEnvelope({ type: 'asset:remove', assetId: 'asset-1' }));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('asset:removed');
      expect(events[0].payload.assetId).toBe('asset-1');
      expect(events[0].payload.asset).toEqual(sampleAsset);
    });

    it('throws when asset does not exist', () => {
      const state = createInitialState();
      expect(() => handleCommand(state, makeEnvelope({ type: 'asset:remove', assetId: 'nonexistent' }))).toThrow(CommandValidationError);
    });
  });

  describe('asset:update-metadata', () => {
    it('produces asset:metadata-updated event with previous metadata', () => {
      const state = stateWithAsset(sampleAsset);
      const events = handleCommand(state, makeEnvelope({ type: 'asset:update-metadata', assetId: 'asset-1', metadata: { fps: 30 } }));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('asset:metadata-updated');
      expect(events[0].payload.metadata).toEqual({ fps: 30 });
      expect(events[0].payload.previousMetadata).toEqual(sampleAsset.metadata);
    });

    it('throws when asset does not exist', () => {
      const state = createInitialState();
      expect(() => handleCommand(state, makeEnvelope({ type: 'asset:update-metadata', assetId: 'nope', metadata: { fps: 30 } }))).toThrow(CommandValidationError);
    });
  });

  describe('asset:tag', () => {
    it('produces asset:tagged event with previous tags', () => {
      const tagged = { ...sampleAsset, tags: ['old'] };
      const state = stateWithAsset(tagged);
      const events = handleCommand(state, makeEnvelope({ type: 'asset:tag', assetId: 'asset-1', tags: ['new', 'tags'] }));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('asset:tagged');
      expect(events[0].payload.tags).toEqual(['new', 'tags']);
      expect(events[0].payload.previousTags).toEqual(['old']);
    });

    it('throws when asset does not exist', () => {
      const state = createInitialState();
      expect(() => handleCommand(state, makeEnvelope({ type: 'asset:tag', assetId: 'nope', tags: [] }))).toThrow(CommandValidationError);
    });
  });

  describe('asset:set-status', () => {
    it('produces asset:status-changed event with previous status', () => {
      const assetWithStatus: Asset = { ...sampleAsset, status: 'generating' };
      const state = stateWithAsset(assetWithStatus);
      const events = handleCommand(state, makeEnvelope({
        type: 'asset:set-status',
        assetId: 'asset-1',
        status: 'ready',
      }));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('asset:status-changed');
      expect(events[0].payload.assetId).toBe('asset-1');
      expect(events[0].payload.status).toBe('ready');
      expect(events[0].payload.previousStatus).toBe('generating');
    });

    it('reports previousStatus as undefined when the asset had no explicit status', () => {
      const state = stateWithAsset(sampleAsset);
      const events = handleCommand(state, makeEnvelope({
        type: 'asset:set-status',
        assetId: 'asset-1',
        status: 'failed',
      }));
      expect(events).toHaveLength(1);
      expect(events[0].payload.previousStatus).toBeUndefined();
    });

    it('throws when asset does not exist', () => {
      const state = createInitialState();
      expect(() => handleCommand(state, makeEnvelope({
        type: 'asset:set-status',
        assetId: 'missing',
        status: 'ready',
      }))).toThrow(CommandValidationError);
    });
  });
});

describe('handleCommand — provenance commands', () => {
  describe('provenance:set-root', () => {
    it('produces provenance:root-set event', () => {
      const state = stateWithAsset(sampleAsset);
      const op = { type: 'upload' as const, actor: 'human' as const, timestamp: 1000 };
      const events = handleCommand(state, makeEnvelope({ type: 'provenance:set-root', assetId: 'asset-1', operation: op }));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('provenance:root-set');
      expect(events[0].payload.assetId).toBe('asset-1');
      expect(events[0].payload.edgeId).toBeDefined();
    });

    it('throws when asset does not exist', () => {
      const state = createInitialState();
      expect(() => handleCommand(state, makeEnvelope({
        type: 'provenance:set-root', assetId: 'nope',
        operation: { type: 'upload', actor: 'human', timestamp: 1000 },
      }))).toThrow(CommandValidationError);
    });
  });

  describe('provenance:link', () => {
    it('produces provenance:linked event', () => {
      const parent: Asset = { ...sampleAsset, id: 'p1' };
      const child: Asset = { ...sampleAsset, id: 'c1' };
      let state = stateWithAsset(parent);
      state = { ...state, registry: new Map([...state.registry, ['c1', child]]) };
      const op = { type: 'derive' as const, actor: 'agent' as const, timestamp: 2000 };
      const events = handleCommand(state, makeEnvelope({ type: 'provenance:link', fromAssetId: 'p1', toAssetId: 'c1', operation: op }));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('provenance:linked');
      expect(events[0].payload.fromAssetId).toBe('p1');
      expect(events[0].payload.toAssetId).toBe('c1');
    });

    it('allows null fromAssetId (root link)', () => {
      const state = stateWithAsset(sampleAsset);
      const op = { type: 'generate' as const, actor: 'agent' as const, timestamp: 2000 };
      const events = handleCommand(state, makeEnvelope({ type: 'provenance:link', fromAssetId: null, toAssetId: 'asset-1', operation: op }));
      expect(events).toHaveLength(1);
      expect(events[0].payload.fromAssetId).toBeNull();
    });

    it('throws when toAssetId does not exist', () => {
      const state = stateWithAsset(sampleAsset);
      const op = { type: 'derive' as const, actor: 'agent' as const, timestamp: 2000 };
      expect(() => handleCommand(state, makeEnvelope({ type: 'provenance:link', fromAssetId: 'asset-1', toAssetId: 'nope', operation: op }))).toThrow(CommandValidationError);
    });

    it('throws when fromAssetId is not null and does not exist', () => {
      const state = stateWithAsset(sampleAsset);
      const op = { type: 'derive' as const, actor: 'agent' as const, timestamp: 2000 };
      expect(() => handleCommand(state, makeEnvelope({ type: 'provenance:link', fromAssetId: 'nope', toAssetId: 'asset-1', operation: op }))).toThrow(CommandValidationError);
    });

    it('throws when link would create a cycle', () => {
      const a: Asset = { ...sampleAsset, id: 'a' };
      const b: Asset = { ...sampleAsset, id: 'b' };
      const c: Asset = { ...sampleAsset, id: 'c' };
      const op = { type: 'derive' as const, actor: 'agent' as const, timestamp: 2000 };
      let state = createInitialState();
      state = { ...state, registry: new Map([['a', a], ['b', b], ['c', c]]) };
      const nodes = new Map<string, ProvenanceNode>();
      nodes.set('a', { assetId: 'a', parentIds: [], childIds: ['b'], rootOperation: { type: 'upload', actor: 'human', timestamp: 1000 } });
      nodes.set('b', { assetId: 'b', parentIds: ['a'], childIds: ['c'], rootOperation: op });
      nodes.set('c', { assetId: 'c', parentIds: ['b'], childIds: [], rootOperation: op });
      state = { ...state, provenance: { ...state.provenance, nodes } };
      expect(() => handleCommand(state, makeEnvelope({ type: 'provenance:link', fromAssetId: 'c', toAssetId: 'a', operation: op }))).toThrow(CommandValidationError);
    });
  });

  describe('provenance:unlink', () => {
    it('produces provenance:unlinked event with full edge data', () => {
      const edge: ProvenanceEdge = {
        id: 'edge-1', fromAssetId: 'p1', toAssetId: 'c1',
        operation: { type: 'derive', actor: 'agent', timestamp: 2000 },
      };
      let state = createInitialState();
      state = { ...state, provenance: { ...state.provenance, edges: new Map([['edge-1', edge]]) } };
      const events = handleCommand(state, makeEnvelope({ type: 'provenance:unlink', edgeId: 'edge-1' }));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('provenance:unlinked');
      expect(events[0].payload.edge).toEqual(edge);
    });

    it('throws when edge does not exist', () => {
      const state = createInitialState();
      expect(() => handleCommand(state, makeEnvelope({ type: 'provenance:unlink', edgeId: 'nope' }))).toThrow(CommandValidationError);
    });
  });
});

describe('handleCommand — selection commands', () => {
  describe('selection:set', () => {
    it('produces selection:set event with previous selection', () => {
      const state = createInitialState();
      const selection = { type: 'asset' as const, ids: ['a1'] };
      const events = handleCommand(state, makeEnvelope({ type: 'selection:set', selection }));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('selection:set');
      expect(events[0].payload.selection).toEqual(selection);
      expect(events[0].payload.previousSelection).toEqual({ type: 'none', ids: [] });
    });
  });

  describe('selection:clear', () => {
    it('produces selection:cleared event with previous selection', () => {
      let state = createInitialState();
      state = { ...state, selection: { type: 'asset', ids: ['a1'] } };
      const events = handleCommand(state, makeEnvelope({ type: 'selection:clear' }));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('selection:cleared');
      expect(events[0].payload.previousSelection).toEqual({ type: 'asset', ids: ['a1'] });
    });
  });
});
