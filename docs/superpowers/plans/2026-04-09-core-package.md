# @pneuma-craft/core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the complete @pneuma-craft/core package — event-sourced state protocol with asset registry, provenance graph, and undo/redo.

**Architecture:** All state changes flow through `Command → CommandHandler → Event(s) → EventStore → State`. The EventStore is an append-only in-memory log. State is a pure projection (fold) of events. Undo/redo works by generating compensating events at the event level — no event is ever deleted, the log only grows. The CraftCore facade wires these pieces together and provides the public API.

**Tech Stack:** TypeScript 5.7+ strict, Vitest for testing, nanoid for ID generation. No runtime framework dependencies.

---

## File Structure

```
packages/core/
├── src/
│   ├── types.ts              # (existing) Domain types + internal typed event union
│   ├── events.ts             # CoreEvent discriminated union (typed payloads)
│   ├── id.ts                 # ID generation via nanoid
│   ├── event-store.ts        # Append-only event log with subscriptions
│   ├── state.ts              # createInitialState, applyEvent, projectState
│   ├── command-handler.ts    # Command validation + event production
│   ├── asset-queries.ts      # Pure query functions for asset registry
│   ├── provenance-queries.ts # Pure query functions for provenance graph
│   ├── undo-manager.ts       # Undo/redo via compensating events
│   ├── core.ts               # CraftCore facade — public entry point
│   └── index.ts              # (existing) Update with all public exports
├── __tests__/
│   ├── event-store.test.ts
│   ├── state.test.ts
│   ├── command-handler.test.ts
│   ├── asset-queries.test.ts
│   ├── provenance-queries.test.ts
│   ├── undo-manager.test.ts
│   └── core.test.ts
└── package.json              # Add nanoid dependency
```

---

### Task 1: Setup + ID Generation

**Files:**
- Modify: `packages/core/package.json` (add nanoid)
- Create: `packages/core/src/id.ts`
- Create: `packages/core/__tests__/id.test.ts`

- [ ] **Step 1: Add nanoid dependency**

```bash
cd packages/core && bun add nanoid
```

- [ ] **Step 2: Write the failing test**

```typescript
// packages/core/__tests__/id.test.ts
import { describe, it, expect } from 'vitest';
import { generateId } from '../src/id.js';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && bun run test`
Expected: FAIL — cannot resolve `../src/id.js`

- [ ] **Step 4: Write implementation**

```typescript
// packages/core/src/id.ts
import { nanoid } from 'nanoid';

export function generateId(): string {
  return nanoid();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && bun run test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/package.json packages/core/src/id.ts packages/core/__tests__/id.test.ts bun.lock
git commit -m "feat(core): add ID generation with nanoid"
```

---

### Task 1b: Typed Event Definitions

Addresses review finding: `Record<string, unknown>` payloads are a type-safety escape hatch. Define a discriminated union of internal typed events so `applyEvent` and `invertEvent` get compile-time payload checking.

**Files:**
- Create: `packages/core/src/events.ts`

- [ ] **Step 1: Create typed event union**

```typescript
// packages/core/src/events.ts
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
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/core && bun run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/events.ts
git commit -m "feat(core): typed CoreEvent discriminated union for payload safety"
```

---

### Task 2: EventStore

**Files:**
- Create: `packages/core/src/event-store.ts`
- Create: `packages/core/__tests__/event-store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/__tests__/event-store.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createEventStore } from '../src/event-store.js';
import type { Event } from '../src/types.js';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-1',
    commandId: 'cmd-1',
    actor: 'human',
    timestamp: 1000,
    type: 'asset:registered',
    payload: {},
    ...overrides,
  };
}

describe('EventStore', () => {
  it('starts empty', () => {
    const store = createEventStore();
    expect(store.getAll()).toEqual([]);
  });

  it('appends and retrieves events', () => {
    const store = createEventStore();
    const event = makeEvent();
    store.append(event);
    expect(store.getAll()).toEqual([event]);
  });

  it('getAll returns a copy (not the internal array)', () => {
    const store = createEventStore();
    store.append(makeEvent());
    const all = store.getAll();
    all.length = 0;
    expect(store.getAll()).toHaveLength(1);
  });

  it('getSince returns events after the given event ID', () => {
    const store = createEventStore();
    store.append(makeEvent({ id: 'e1' }));
    store.append(makeEvent({ id: 'e2' }));
    store.append(makeEvent({ id: 'e3' }));
    expect(store.getSince('e1').map(e => e.id)).toEqual(['e2', 'e3']);
    expect(store.getSince('e3')).toEqual([]);
  });

  it('getSince returns empty for unknown event ID', () => {
    const store = createEventStore();
    store.append(makeEvent({ id: 'e1' }));
    expect(store.getSince('unknown')).toEqual([]);
  });

  it('getByActor filters events by actor', () => {
    const store = createEventStore();
    store.append(makeEvent({ id: 'e1', actor: 'human' }));
    store.append(makeEvent({ id: 'e2', actor: 'agent' }));
    store.append(makeEvent({ id: 'e3', actor: 'human' }));
    expect(store.getByActor('human').map(e => e.id)).toEqual(['e1', 'e3']);
    expect(store.getByActor('agent').map(e => e.id)).toEqual(['e2']);
  });

  it('subscribe notifies on append', () => {
    const store = createEventStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const event = makeEvent();
    store.append(event);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('unsubscribe stops notifications', () => {
    const store = createEventStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.append(makeEvent());
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && bun run test`
Expected: FAIL — cannot resolve `../src/event-store.js`

- [ ] **Step 3: Write implementation**

```typescript
// packages/core/src/event-store.ts
import type { Event, Actor } from './types.js';

export interface EventStore {
  append(event: Event): void;
  getAll(): Event[];
  getSince(eventId: string): Event[];
  getByActor(actor: Actor): Event[];
  subscribe(listener: (event: Event) => void): () => void;
}

export function createEventStore(): EventStore {
  const events: Event[] = [];
  const listeners = new Set<(event: Event) => void>();

  return {
    append(event: Event): void {
      events.push(event);
      for (const listener of listeners) {
        listener(event);
      }
    },

    getAll(): Event[] {
      return events.slice();
    },

    getSince(eventId: string): Event[] {
      const index = events.findIndex(e => e.id === eventId);
      if (index === -1) return [];
      return events.slice(index + 1);
    },

    getByActor(actor: Actor): Event[] {
      return events.filter(e => e.actor === actor);
    },

    subscribe(listener: (event: Event) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && bun run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/event-store.ts packages/core/__tests__/event-store.test.ts
git commit -m "feat(core): implement EventStore with append-only log and subscriptions"
```

---

### Task 3: State Projection

**Files:**
- Create: `packages/core/src/state.ts`
- Create: `packages/core/__tests__/state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/__tests__/state.test.ts
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

    // Unlink the only edge — node becomes orphan and should be removed
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && bun run test`
Expected: FAIL — cannot resolve `../src/state.js`

- [ ] **Step 3: Write implementation**

```typescript
// packages/core/src/state.ts
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

    case 'provenance:root-set': {
      const { assetId, operation, edgeId } = e.payload;
      const nodes = new Map(state.provenance.nodes);
      const edges = new Map(state.provenance.edges);

      const node: ProvenanceNode = {
        assetId,
        parentIds: [],
        childIds: [],
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
        // Remove orphan node
        if (updated.parentIds.length === 0 && updated.childIds.length === 0
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && bun run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/state.ts packages/core/__tests__/state.test.ts
git commit -m "feat(core): implement state projection (applyEvent + projectState)"
```

---

### Task 4: Command Handler — Asset Commands

**Files:**
- Create: `packages/core/src/command-handler.ts`
- Create: `packages/core/__tests__/command-handler.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/__tests__/command-handler.test.ts
import { describe, it, expect } from 'vitest';
import { handleCommand, CommandValidationError } from '../src/command-handler.js';
import { createInitialState, applyEvent } from '../src/state.js';
import type { CommandEnvelope, Asset, PneumaCraftCoreState } from '../src/types.js';

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
  });

  describe('asset:remove', () => {
    it('produces asset:removed event', () => {
      const state = stateWithAsset(sampleAsset);
      const events = handleCommand(state, makeEnvelope({
        type: 'asset:remove', assetId: 'asset-1',
      }));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('asset:removed');
      expect(events[0].payload.assetId).toBe('asset-1');
      expect(events[0].payload.asset).toEqual(sampleAsset);
    });

    it('throws when asset does not exist', () => {
      const state = createInitialState();
      expect(() => handleCommand(state, makeEnvelope({
        type: 'asset:remove', assetId: 'nonexistent',
      }))).toThrow(CommandValidationError);
    });
  });

  describe('asset:update-metadata', () => {
    it('produces asset:metadata-updated event with previous metadata', () => {
      const state = stateWithAsset(sampleAsset);
      const events = handleCommand(state, makeEnvelope({
        type: 'asset:update-metadata', assetId: 'asset-1', metadata: { fps: 30 },
      }));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('asset:metadata-updated');
      expect(events[0].payload.metadata).toEqual({ fps: 30 });
      expect(events[0].payload.previousMetadata).toEqual(sampleAsset.metadata);
    });

    it('throws when asset does not exist', () => {
      const state = createInitialState();
      expect(() => handleCommand(state, makeEnvelope({
        type: 'asset:update-metadata', assetId: 'nope', metadata: { fps: 30 },
      }))).toThrow(CommandValidationError);
    });
  });

  describe('asset:tag', () => {
    it('produces asset:tagged event with previous tags', () => {
      const tagged = { ...sampleAsset, tags: ['old'] };
      const state = stateWithAsset(tagged);
      const events = handleCommand(state, makeEnvelope({
        type: 'asset:tag', assetId: 'asset-1', tags: ['new', 'tags'],
      }));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('asset:tagged');
      expect(events[0].payload.tags).toEqual(['new', 'tags']);
      expect(events[0].payload.previousTags).toEqual(['old']);
    });

    it('throws when asset does not exist', () => {
      const state = createInitialState();
      expect(() => handleCommand(state, makeEnvelope({
        type: 'asset:tag', assetId: 'nope', tags: [],
      }))).toThrow(CommandValidationError);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && bun run test`
Expected: FAIL — cannot resolve `../src/command-handler.js`

- [ ] **Step 3: Write implementation**

```typescript
// packages/core/src/command-handler.ts
import type {
  PneumaCraftCoreState,
  CommandEnvelope,
  Event,
  CoreCommand,
  Asset,
  ProvenanceEdge,
  Operation,
} from './types.js';
import { generateId } from './id.js';

export class CommandValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandValidationError';
  }
}

function makeEvent(
  envelope: CommandEnvelope,
  type: string,
  payload: Record<string, unknown>,
): Event {
  return {
    id: generateId(),
    commandId: envelope.id,
    actor: envelope.actor,
    timestamp: envelope.timestamp,
    type,
    payload,
  };
}

function requireAsset(state: PneumaCraftCoreState, assetId: string): Asset {
  const asset = state.registry.get(assetId);
  if (!asset) {
    throw new CommandValidationError(`Asset not found: ${assetId}`);
  }
  return asset;
}

export function handleCommand(
  state: PneumaCraftCoreState,
  envelope: CommandEnvelope,
): Event[] {
  const { command } = envelope;

  switch (command.type) {
    // ── Asset commands ──────────────────────────────────────
    case 'asset:register': {
      const asset: Asset = {
        ...command.asset,
        id: generateId(),
        createdAt: envelope.timestamp,
      };
      return [makeEvent(envelope, 'asset:registered', { asset })];
    }

    case 'asset:remove': {
      const asset = requireAsset(state, command.assetId);
      return [makeEvent(envelope, 'asset:removed', { assetId: command.assetId, asset })];
    }

    case 'asset:update-metadata': {
      const asset = requireAsset(state, command.assetId);
      return [makeEvent(envelope, 'asset:metadata-updated', {
        assetId: command.assetId,
        metadata: command.metadata,
        previousMetadata: asset.metadata,
      })];
    }

    case 'asset:tag': {
      const asset = requireAsset(state, command.assetId);
      return [makeEvent(envelope, 'asset:tagged', {
        assetId: command.assetId,
        tags: command.tags,
        previousTags: asset.tags,
      })];
    }

    // ── Provenance commands (Task 5) ────────────────────────
    // ── Selection commands (Task 6) ─────────────────────────

    default:
      throw new CommandValidationError(`Unknown command type: ${(command as CoreCommand).type}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && bun run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/command-handler.ts packages/core/__tests__/command-handler.test.ts
git commit -m "feat(core): command handler with asset commands"
```

---

### Task 5: Command Handler — Provenance Commands

**Files:**
- Modify: `packages/core/src/command-handler.ts`
- Modify: `packages/core/__tests__/command-handler.test.ts`

- [ ] **Step 1: Add provenance tests to the test file**

Append to `packages/core/__tests__/command-handler.test.ts`:

```typescript
describe('handleCommand — provenance commands', () => {
  describe('provenance:set-root', () => {
    it('produces provenance:root-set event', () => {
      const state = stateWithAsset(sampleAsset);
      const op = { type: 'upload' as const, actor: 'human' as const, timestamp: 1000 };
      const events = handleCommand(state, makeEnvelope({
        type: 'provenance:set-root', assetId: 'asset-1', operation: op,
      }));

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
      const events = handleCommand(state, makeEnvelope({
        type: 'provenance:link', fromAssetId: 'p1', toAssetId: 'c1', operation: op,
      }));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('provenance:linked');
      expect(events[0].payload.fromAssetId).toBe('p1');
      expect(events[0].payload.toAssetId).toBe('c1');
    });

    it('allows null fromAssetId (root link)', () => {
      const state = stateWithAsset(sampleAsset);
      const op = { type: 'generate' as const, actor: 'agent' as const, timestamp: 2000 };
      const events = handleCommand(state, makeEnvelope({
        type: 'provenance:link', fromAssetId: null, toAssetId: 'asset-1', operation: op,
      }));

      expect(events).toHaveLength(1);
      expect(events[0].payload.fromAssetId).toBeNull();
    });

    it('throws when toAssetId does not exist', () => {
      const state = stateWithAsset(sampleAsset);
      const op = { type: 'derive' as const, actor: 'agent' as const, timestamp: 2000 };
      expect(() => handleCommand(state, makeEnvelope({
        type: 'provenance:link', fromAssetId: 'asset-1', toAssetId: 'nope', operation: op,
      }))).toThrow(CommandValidationError);
    });

    it('throws when fromAssetId is not null and does not exist', () => {
      const state = stateWithAsset(sampleAsset);
      const op = { type: 'derive' as const, actor: 'agent' as const, timestamp: 2000 };
      expect(() => handleCommand(state, makeEnvelope({
        type: 'provenance:link', fromAssetId: 'nope', toAssetId: 'asset-1', operation: op,
      }))).toThrow(CommandValidationError);
    });

    it('throws when link would create a cycle', () => {
      // Build: A → B → C, then try C → A
      const a: Asset = { ...sampleAsset, id: 'a' };
      const b: Asset = { ...sampleAsset, id: 'b' };
      const c: Asset = { ...sampleAsset, id: 'c' };
      const op = { type: 'derive' as const, actor: 'agent' as const, timestamp: 2000 };

      let state = createInitialState();
      state = { ...state, registry: new Map([['a', a], ['b', b], ['c', c]]) };
      // Build provenance nodes: A → B → C
      const nodes = new Map<string, import('../src/types.js').ProvenanceNode>();
      nodes.set('a', { assetId: 'a', parentIds: [], childIds: ['b'], rootOperation: { type: 'upload', actor: 'human', timestamp: 1000 } });
      nodes.set('b', { assetId: 'b', parentIds: ['a'], childIds: ['c'], rootOperation: op });
      nodes.set('c', { assetId: 'c', parentIds: ['b'], childIds: [], rootOperation: op });
      state = { ...state, provenance: { ...state.provenance, nodes } };

      expect(() => handleCommand(state, makeEnvelope({
        type: 'provenance:link', fromAssetId: 'c', toAssetId: 'a', operation: op,
      }))).toThrow(CommandValidationError);
    });
  });

  describe('provenance:unlink', () => {
    it('produces provenance:unlinked event with full edge data', () => {
      const edge: ProvenanceEdge = {
        id: 'edge-1', fromAssetId: 'p1', toAssetId: 'c1',
        operation: { type: 'derive', actor: 'agent', timestamp: 2000 },
      };
      let state = createInitialState();
      state = {
        ...state,
        provenance: {
          ...state.provenance,
          edges: new Map([['edge-1', edge]]),
          nodes: state.provenance.nodes,
        },
      };

      const events = handleCommand(state, makeEnvelope({
        type: 'provenance:unlink', edgeId: 'edge-1',
      }));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('provenance:unlinked');
      expect(events[0].payload.edge).toEqual(edge);
    });

    it('throws when edge does not exist', () => {
      const state = createInitialState();
      expect(() => handleCommand(state, makeEnvelope({
        type: 'provenance:unlink', edgeId: 'nope',
      }))).toThrow(CommandValidationError);
    });
  });
});
```

- [ ] **Step 2: Run test to verify new tests fail**

Run: `cd packages/core && bun run test`
Expected: FAIL — unmatched switch cases hit default → "Unknown command type"

- [ ] **Step 3: Add provenance cases to handleCommand**

Add these cases to the switch in `packages/core/src/command-handler.ts`, replacing the `// ── Provenance commands (Task 5)` comment:

```typescript
    case 'provenance:set-root': {
      requireAsset(state, command.assetId);
      return [makeEvent(envelope, 'provenance:root-set', {
        assetId: command.assetId,
        operation: command.operation,
        edgeId: generateId(),
      })];
    }

    case 'provenance:link': {
      if (command.fromAssetId !== null) {
        requireAsset(state, command.fromAssetId);
      }
      requireAsset(state, command.toAssetId);

      // Cycle detection: BFS up from fromAssetId — if we reach toAssetId, it's a cycle
      if (command.fromAssetId !== null) {
        const visited = new Set<string>();
        const queue = [command.fromAssetId];
        while (queue.length > 0) {
          const current = queue.shift()!;
          if (current === command.toAssetId) {
            throw new CommandValidationError(
              `Provenance link would create a cycle: ${command.toAssetId} is an ancestor of ${command.fromAssetId}`,
            );
          }
          if (visited.has(current)) continue;
          visited.add(current);
          const node = state.provenance.nodes.get(current);
          if (node) queue.push(...node.parentIds);
        }
      }

      return [makeEvent(envelope, 'provenance:linked', {
        edgeId: generateId(),
        fromAssetId: command.fromAssetId,
        toAssetId: command.toAssetId,
        operation: command.operation,
      })];
    }

    case 'provenance:unlink': {
      const edge = state.provenance.edges.get(command.edgeId);
      if (!edge) {
        throw new CommandValidationError(`Provenance edge not found: ${command.edgeId}`);
      }
      return [makeEvent(envelope, 'provenance:unlinked', {
        edgeId: command.edgeId,
        edge,
      })];
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && bun run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/command-handler.ts packages/core/__tests__/command-handler.test.ts
git commit -m "feat(core): add provenance commands to command handler"
```

---

### Task 6: Command Handler — Selection Commands

**Files:**
- Modify: `packages/core/src/command-handler.ts`
- Modify: `packages/core/__tests__/command-handler.test.ts`

- [ ] **Step 1: Add selection tests to the test file**

Append to `packages/core/__tests__/command-handler.test.ts`:

```typescript
describe('handleCommand — selection commands', () => {
  describe('selection:set', () => {
    it('produces selection:set event with previous selection', () => {
      const state = createInitialState();
      const selection = { type: 'asset' as const, ids: ['a1'] };
      const events = handleCommand(state, makeEnvelope({
        type: 'selection:set', selection,
      }));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('selection:set');
      expect(events[0].payload.selection).toEqual(selection);
      expect(events[0].payload.previousSelection).toEqual({ type: 'none', ids: [] });
    });
  });

  describe('selection:clear', () => {
    it('produces selection:cleared event with previous selection', () => {
      let state = createInitialState();
      // Simulate a selected state
      state = { ...state, selection: { type: 'asset', ids: ['a1'] } };

      const events = handleCommand(state, makeEnvelope({
        type: 'selection:clear',
      }));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('selection:cleared');
      expect(events[0].payload.previousSelection).toEqual({ type: 'asset', ids: ['a1'] });
    });
  });
});
```

- [ ] **Step 2: Run test to verify new tests fail**

Run: `cd packages/core && bun run test`
Expected: FAIL

- [ ] **Step 3: Add selection cases to handleCommand**

Add these cases to the switch in `packages/core/src/command-handler.ts`, replacing the `// ── Selection commands (Task 6)` comment:

```typescript
    case 'selection:set': {
      return [makeEvent(envelope, 'selection:set', {
        selection: command.selection,
        previousSelection: state.selection,
      })];
    }

    case 'selection:clear': {
      return [makeEvent(envelope, 'selection:cleared', {
        previousSelection: state.selection,
      })];
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && bun run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/command-handler.ts packages/core/__tests__/command-handler.test.ts
git commit -m "feat(core): add selection commands to command handler"
```

---

### Task 7: Asset Registry Queries

**Files:**
- Create: `packages/core/src/asset-queries.ts`
- Create: `packages/core/__tests__/asset-queries.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/__tests__/asset-queries.test.ts
import { describe, it, expect } from 'vitest';
import { getAssetById, getAssetsByType, searchAssets } from '../src/asset-queries.js';
import { createInitialState } from '../src/state.js';
import type { Asset, PneumaCraftCoreState } from '../src/types.js';

function stateWithAssets(...assets: Asset[]): PneumaCraftCoreState {
  const state = createInitialState();
  const registry = new Map(assets.map(a => [a.id, a]));
  return { ...state, registry };
}

const video1: Asset = {
  id: 'v1', type: 'video', uri: '/clip1.mp4', name: 'Hero Shot',
  metadata: { width: 1920 }, createdAt: 1000, tags: ['hero', 'intro'],
};
const video2: Asset = {
  id: 'v2', type: 'video', uri: '/clip2.mp4', name: 'B-Roll',
  metadata: {}, createdAt: 2000, tags: ['broll'],
};
const image1: Asset = {
  id: 'i1', type: 'image', uri: '/bg.png', name: 'Background Image',
  metadata: { width: 3840 }, createdAt: 3000,
};

describe('getAssetById', () => {
  it('returns asset when found', () => {
    const state = stateWithAssets(video1);
    expect(getAssetById(state, 'v1')).toEqual(video1);
  });

  it('returns undefined when not found', () => {
    const state = stateWithAssets(video1);
    expect(getAssetById(state, 'nope')).toBeUndefined();
  });
});

describe('getAssetsByType', () => {
  it('returns all assets of given type', () => {
    const state = stateWithAssets(video1, video2, image1);
    const videos = getAssetsByType(state, 'video');
    expect(videos).toHaveLength(2);
    expect(videos.map(a => a.id).sort()).toEqual(['v1', 'v2']);
  });

  it('returns empty array when no matches', () => {
    const state = stateWithAssets(video1);
    expect(getAssetsByType(state, 'audio')).toEqual([]);
  });
});

describe('searchAssets', () => {
  it('matches by name (case-insensitive)', () => {
    const state = stateWithAssets(video1, video2, image1);
    const results = searchAssets(state, 'hero');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('v1');
  });

  it('matches by tag', () => {
    const state = stateWithAssets(video1, video2, image1);
    const results = searchAssets(state, 'broll');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('v2');
  });

  it('matches partial name', () => {
    const state = stateWithAssets(video1, video2, image1);
    const results = searchAssets(state, 'back');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('i1');
  });

  it('returns empty for no match', () => {
    const state = stateWithAssets(video1);
    expect(searchAssets(state, 'zzz')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && bun run test`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// packages/core/src/asset-queries.ts
import type { PneumaCraftCoreState, Asset, AssetType } from './types.js';

export function getAssetById(
  state: PneumaCraftCoreState,
  assetId: string,
): Asset | undefined {
  return state.registry.get(assetId);
}

export function getAssetsByType(
  state: PneumaCraftCoreState,
  type: AssetType,
): Asset[] {
  return Array.from(state.registry.values()).filter(a => a.type === type);
}

export function searchAssets(
  state: PneumaCraftCoreState,
  query: string,
): Asset[] {
  const lower = query.toLowerCase();
  return Array.from(state.registry.values()).filter(asset => {
    if (asset.name.toLowerCase().includes(lower)) return true;
    if (asset.tags?.some(tag => tag.toLowerCase().includes(lower))) return true;
    return false;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && bun run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/asset-queries.ts packages/core/__tests__/asset-queries.test.ts
git commit -m "feat(core): asset registry query functions"
```

---

### Task 8: Provenance Graph Queries

**Files:**
- Create: `packages/core/src/provenance-queries.ts`
- Create: `packages/core/__tests__/provenance-queries.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/__tests__/provenance-queries.test.ts
import { describe, it, expect } from 'vitest';
import {
  getLineage,
  getAncestors,
  getVariants,
  getRoots,
  getOperationsByActor,
  getTree,
} from '../src/provenance-queries.js';
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
  state = applyEvent(state, makeEvent('provenance:root-set', {
    assetId: 'root', operation: uploadOp, edgeId: 'edge-root',
  }, 'e5'));
  state = applyEvent(state, makeEvent('provenance:linked', {
    edgeId: 'edge-1', fromAssetId: 'root', toAssetId: 'c1', operation: deriveOp,
  }, 'e6'));
  state = applyEvent(state, makeEvent('provenance:linked', {
    edgeId: 'edge-2', fromAssetId: 'root', toAssetId: 'c2',
    operation: { ...deriveOp, actor: 'human' as const },
  }, 'e7'));
  state = applyEvent(state, makeEvent('provenance:linked', {
    edgeId: 'edge-3', fromAssetId: 'c1', toAssetId: 'gc', operation: deriveOp,
  }, 'e8'));

  return state;
}

describe('getLineage (primary parent chain)', () => {
  it('returns first-parent ancestor chain from asset to root', () => {
    const state = buildGraphState();
    const lineage = getLineage(state, 'gc');
    expect(lineage.map(a => a.id)).toEqual(['c1', 'root']);
  });

  it('returns empty for root asset', () => {
    const state = buildGraphState();
    expect(getLineage(state, 'root')).toEqual([]);
  });

  it('returns empty for unknown asset', () => {
    const state = buildGraphState();
    expect(getLineage(state, 'unknown')).toEqual([]);
  });
});

describe('getAncestors (all ancestors in DAG)', () => {
  it('returns all ancestors via BFS', () => {
    const state = buildGraphState();
    const ancestors = getAncestors(state, 'gc');
    expect(ancestors.map(a => a.id).sort()).toEqual(['c1', 'root']);
  });

  it('returns empty for root asset', () => {
    const state = buildGraphState();
    expect(getAncestors(state, 'root')).toEqual([]);
  });

  it('handles multi-parent nodes (composite)', () => {
    // Add a composite node: merge c1 + c2 → merged
    const merged: Asset = { id: 'merged', type: 'image', uri: '/m.png', name: 'Merged', metadata: {}, createdAt: 5000 };
    const compositeOp = { type: 'composite' as const, actor: 'agent' as const, timestamp: 5000 };
    let state = buildGraphState();
    state = applyEvent(state, makeEvent('asset:registered', { asset: merged }, 'e9'));
    state = applyEvent(state, makeEvent('provenance:linked', {
      edgeId: 'edge-4', fromAssetId: 'c1', toAssetId: 'merged', operation: compositeOp,
    }, 'e10'));
    state = applyEvent(state, makeEvent('provenance:linked', {
      edgeId: 'edge-5', fromAssetId: 'c2', toAssetId: 'merged', operation: compositeOp,
    }, 'e11'));

    const ancestors = getAncestors(state, 'merged');
    // Should include c1, c2, and root (via both parents)
    expect(ancestors.map(a => a.id).sort()).toEqual(['c1', 'c2', 'root']);
  });
});

describe('getVariants', () => {
  it('returns direct children', () => {
    const state = buildGraphState();
    const variants = getVariants(state, 'root');
    expect(variants.map(a => a.id).sort()).toEqual(['c1', 'c2']);
  });

  it('returns empty for leaf', () => {
    const state = buildGraphState();
    expect(getVariants(state, 'gc')).toEqual([]);
  });
});

describe('getRoots', () => {
  it('returns assets with no parents', () => {
    const state = buildGraphState();
    const roots = getRoots(state);
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('root');
  });
});

describe('getOperationsByActor', () => {
  it('filters edges by actor', () => {
    const state = buildGraphState();
    const agentOps = getOperationsByActor(state, 'agent');
    expect(agentOps.length).toBeGreaterThanOrEqual(2);
    agentOps.forEach(edge => {
      expect(edge.operation.actor).toBe('agent');
    });
  });
});

describe('getTree', () => {
  it('returns full subtree from root', () => {
    const state = buildGraphState();
    const tree = getTree(state, 'root');
    expect(tree).toBeDefined();
    expect(tree!.assetId).toBe('root');
    expect(tree!.children).toHaveLength(2);

    const c1Node = tree!.children.find(c => c.assetId === 'c1');
    expect(c1Node).toBeDefined();
    expect(c1Node!.children).toHaveLength(1);
    expect(c1Node!.children[0].assetId).toBe('gc');
  });

  it('returns null for unknown asset', () => {
    const state = buildGraphState();
    expect(getTree(state, 'unknown')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && bun run test`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// packages/core/src/provenance-queries.ts
import type {
  PneumaCraftCoreState,
  Asset,
  Actor,
  ProvenanceEdge,
  ProvenanceNode,
} from './types.js';

/**
 * Primary lineage: follows first parent at each level.
 * Use for simple "where did this come from?" UI.
 * For full DAG ancestry (multi-parent), use getAncestors.
 */
export function getLineage(
  state: PneumaCraftCoreState,
  assetId: string,
): Asset[] {
  const lineage: Asset[] = [];
  const visited = new Set<string>();
  let current = assetId;

  while (true) {
    const node = state.provenance.nodes.get(current);
    if (!node || node.parentIds.length === 0) break;

    const parentId = node.parentIds[0];
    if (visited.has(parentId)) break;
    visited.add(parentId);

    const parentAsset = state.registry.get(parentId);
    if (!parentAsset) break;

    lineage.push(parentAsset);
    current = parentId;
  }

  return lineage;
}

/**
 * All ancestors via BFS. Handles multi-parent DAG (composite operations).
 * Returns deduplicated list of all ancestor assets.
 */
export function getAncestors(
  state: PneumaCraftCoreState,
  assetId: string,
): Asset[] {
  const ancestors: Asset[] = [];
  const visited = new Set<string>();
  const queue: string[] = [];

  const startNode = state.provenance.nodes.get(assetId);
  if (!startNode) return [];
  queue.push(...startNode.parentIds);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const asset = state.registry.get(current);
    if (asset) ancestors.push(asset);

    const node = state.provenance.nodes.get(current);
    if (node) queue.push(...node.parentIds);
  }

  return ancestors;
}

export function getVariants(
  state: PneumaCraftCoreState,
  assetId: string,
): Asset[] {
  const node = state.provenance.nodes.get(assetId);
  if (!node) return [];

  return node.childIds
    .map(id => state.registry.get(id))
    .filter((a): a is Asset => a !== undefined);
}

export function getRoots(state: PneumaCraftCoreState): Asset[] {
  const roots: Asset[] = [];
  for (const node of state.provenance.nodes.values()) {
    if (node.parentIds.length === 0) {
      const asset = state.registry.get(node.assetId);
      if (asset) roots.push(asset);
    }
  }
  return roots;
}

export function getOperationsByActor(
  state: PneumaCraftCoreState,
  actor: Actor,
): ProvenanceEdge[] {
  return Array.from(state.provenance.edges.values()).filter(
    edge => edge.operation.actor === actor,
  );
}

export interface ProvenanceTreeNode {
  readonly assetId: string;
  readonly node: ProvenanceNode;
  readonly children: ProvenanceTreeNode[];
}

export function getTree(
  state: PneumaCraftCoreState,
  assetId: string,
): ProvenanceTreeNode | null {
  const node = state.provenance.nodes.get(assetId);
  if (!node) return null;

  const children = node.childIds
    .map(id => getTree(state, id))
    .filter((t): t is ProvenanceTreeNode => t !== null);

  return { assetId, node, children };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && bun run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/provenance-queries.ts packages/core/__tests__/provenance-queries.test.ts
git commit -m "feat(core): provenance graph query functions"
```

---

### Task 9: Undo/Redo Manager

Undo/redo works at the event level. The undo manager records events per command, then generates compensating events to reverse them. No event is ever deleted — the log only grows.

**Files:**
- Create: `packages/core/src/undo-manager.ts`
- Create: `packages/core/__tests__/undo-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/__tests__/undo-manager.test.ts
import { describe, it, expect } from 'vitest';
import { createUndoManager } from '../src/undo-manager.js';
import { createInitialState, applyEvent, projectState } from '../src/state.js';
import { handleCommand } from '../src/command-handler.js';
import type { Event, CommandEnvelope, Asset } from '../src/types.js';

function makeEnvelope(command: CommandEnvelope['command'], id = 'cmd-1'): CommandEnvelope {
  return { id, actor: 'human', timestamp: Date.now(), command };
}

describe('UndoManager', () => {
  it('starts with nothing to undo/redo', () => {
    const manager = createUndoManager();
    expect(manager.canUndo()).toBe(false);
    expect(manager.canRedo()).toBe(false);
  });

  it('can undo after recording', () => {
    const manager = createUndoManager();
    const event: Event = {
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'asset:registered',
      payload: { asset: { id: 'a1', type: 'video', uri: '/t.mp4', name: 'T', metadata: {}, createdAt: 1000 } },
    };
    manager.record('cmd-1', [event]);
    expect(manager.canUndo()).toBe(true);
  });

  it('undo of asset:registered produces asset:removed', () => {
    const manager = createUndoManager();
    const asset: Asset = { id: 'a1', type: 'video', uri: '/t.mp4', name: 'T', metadata: {}, createdAt: 1000 };
    const event: Event = {
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'asset:registered', payload: { asset },
    };
    manager.record('cmd-1', [event]);

    const compensating = manager.undo();
    expect(compensating).not.toBeNull();
    expect(compensating).toHaveLength(1);
    expect(compensating![0].type).toBe('asset:removed');
    expect(compensating![0].payload.assetId).toBe('a1');
    expect(compensating![0].payload.asset).toEqual(asset);
  });

  it('undo of asset:removed produces asset:registered', () => {
    const manager = createUndoManager();
    const asset: Asset = { id: 'a1', type: 'video', uri: '/t.mp4', name: 'T', metadata: {}, createdAt: 1000 };
    const event: Event = {
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'asset:removed', payload: { assetId: 'a1', asset },
    };
    manager.record('cmd-1', [event]);

    const compensating = manager.undo();
    expect(compensating![0].type).toBe('asset:registered');
    expect((compensating![0].payload.asset as Asset).id).toBe('a1');
  });

  it('undo of asset:metadata-updated restores previous metadata', () => {
    const manager = createUndoManager();
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'asset:metadata-updated',
      payload: { assetId: 'a1', metadata: { fps: 30 }, previousMetadata: { width: 1920 } },
    }]);

    const compensating = manager.undo()!;
    expect(compensating[0].type).toBe('asset:metadata-updated');
    expect(compensating[0].payload.metadata).toEqual({ width: 1920 });
    expect(compensating[0].payload.previousMetadata).toEqual({ fps: 30 });
  });

  it('undo of asset:tagged restores previous tags', () => {
    const manager = createUndoManager();
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'asset:tagged',
      payload: { assetId: 'a1', tags: ['new'], previousTags: ['old'] },
    }]);

    const compensating = manager.undo()!;
    expect(compensating[0].type).toBe('asset:tagged');
    expect(compensating[0].payload.tags).toEqual(['old']);
    expect(compensating[0].payload.previousTags).toEqual(['new']);
  });

  it('undo of selection:set restores previous selection', () => {
    const manager = createUndoManager();
    const prev = { type: 'none' as const, ids: [] };
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'selection:set',
      payload: { selection: { type: 'asset', ids: ['a1'] }, previousSelection: prev },
    }]);

    const compensating = manager.undo()!;
    expect(compensating[0].type).toBe('selection:set');
    expect(compensating[0].payload.selection).toEqual(prev);
  });

  it('undo of selection:cleared restores previous selection', () => {
    const manager = createUndoManager();
    const prev = { type: 'asset' as const, ids: ['a1'] };
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'selection:cleared', payload: { previousSelection: prev },
    }]);

    const compensating = manager.undo()!;
    expect(compensating[0].type).toBe('selection:set');
    expect(compensating[0].payload.selection).toEqual(prev);
  });

  it('undo of provenance:linked produces provenance:unlinked', () => {
    const op = { type: 'derive' as const, actor: 'agent' as const, timestamp: 2000 };
    const manager = createUndoManager();
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'provenance:linked',
      payload: { edgeId: 'edge-1', fromAssetId: 'p1', toAssetId: 'c1', operation: op },
    }]);

    const compensating = manager.undo()!;
    expect(compensating[0].type).toBe('provenance:unlinked');
    expect(compensating[0].payload.edgeId).toBe('edge-1');
  });

  it('undo of provenance:unlinked produces provenance:linked', () => {
    const op = { type: 'derive' as const, actor: 'agent' as const, timestamp: 2000 };
    const edge = { id: 'edge-1', fromAssetId: 'p1', toAssetId: 'c1', operation: op };
    const manager = createUndoManager();
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'provenance:unlinked', payload: { edgeId: 'edge-1', edge },
    }]);

    const compensating = manager.undo()!;
    expect(compensating[0].type).toBe('provenance:linked');
    expect(compensating[0].payload.edgeId).toBe('edge-1');
    expect(compensating[0].payload.fromAssetId).toBe('p1');
  });

  it('redo reverses the undo', () => {
    const manager = createUndoManager();
    const asset: Asset = { id: 'a1', type: 'video', uri: '/t.mp4', name: 'T', metadata: {}, createdAt: 1000 };
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'asset:registered', payload: { asset },
    }]);

    manager.undo();
    expect(manager.canRedo()).toBe(true);

    const redoEvents = manager.redo()!;
    expect(redoEvents[0].type).toBe('asset:registered');
    expect((redoEvents[0].payload.asset as Asset).id).toBe('a1');
  });

  it('new record clears redo stack', () => {
    const manager = createUndoManager();
    const asset: Asset = { id: 'a1', type: 'video', uri: '/t.mp4', name: 'T', metadata: {}, createdAt: 1000 };
    manager.record('cmd-1', [{
      id: 'e1', commandId: 'cmd-1', actor: 'human', timestamp: 1000,
      type: 'asset:registered', payload: { asset },
    }]);
    manager.undo();
    expect(manager.canRedo()).toBe(true);

    manager.record('cmd-2', [{
      id: 'e2', commandId: 'cmd-2', actor: 'human', timestamp: 2000,
      type: 'asset:registered', payload: { asset: { ...asset, id: 'a2' } },
    }]);
    expect(manager.canRedo()).toBe(false);
  });

  describe('end-to-end: undo restores state', () => {
    it('register → undo → state is empty', () => {
      const manager = createUndoManager();
      const state0 = createInitialState();

      const envelope = makeEnvelope({
        type: 'asset:register',
        asset: { type: 'video', uri: '/t.mp4', name: 'T', metadata: {} },
      });
      const events = handleCommand(state0, envelope);
      manager.record(envelope.id, events);

      // Apply events → state1 has the asset
      const state1 = events.reduce(applyEvent, state0);
      expect(state1.registry.size).toBe(1);

      // Undo → compensating events
      const compensating = manager.undo()!;
      const state2 = compensating.reduce(applyEvent, state1);
      expect(state2.registry.size).toBe(0);

      // Redo → back to state1
      const redoEvents = manager.redo()!;
      const state3 = redoEvents.reduce(applyEvent, state2);
      expect(state3.registry.size).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && bun run test`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// packages/core/src/undo-manager.ts
import type { Event } from './types.js';
import { asCoreEvent } from './events.js';
import { generateId } from './id.js';

interface UndoEntry {
  readonly commandId: string;
  readonly events: readonly Event[];
}

export interface UndoManager {
  record(commandId: string, events: readonly Event[]): void;
  undo(): Event[] | null;
  redo(): Event[] | null;
  canUndo(): boolean;
  canRedo(): boolean;
}

function invertEvent(event: Event): Event {
  const e = asCoreEvent(event);
  const base = {
    id: generateId(),
    commandId: event.commandId,
    actor: event.actor,
    timestamp: Date.now(),
  };

  switch (e.type) {
    case 'asset:registered': {
      const { asset } = e.payload;
      return { ...base, type: 'asset:removed', payload: { assetId: asset.id, asset } };
    }

    case 'asset:removed': {
      return { ...base, type: 'asset:registered', payload: { asset: e.payload.asset } };
    }

    case 'asset:metadata-updated': {
      return {
        ...base,
        type: 'asset:metadata-updated',
        payload: {
          assetId: e.payload.assetId,
          metadata: e.payload.previousMetadata,
          previousMetadata: e.payload.metadata,
        },
      };
    }

    case 'asset:tagged': {
      return {
        ...base,
        type: 'asset:tagged',
        payload: {
          assetId: e.payload.assetId,
          tags: e.payload.previousTags,
          previousTags: e.payload.tags,
        },
      };
    }

    case 'provenance:root-set': {
      const { assetId, operation, edgeId } = e.payload;
      return {
        ...base,
        type: 'provenance:unlinked',
        payload: {
          edgeId,
          edge: { id: edgeId, fromAssetId: null, toAssetId: assetId, operation },
        },
      };
    }

    case 'provenance:linked': {
      const { edgeId, fromAssetId, toAssetId, operation } = e.payload;
      return {
        ...base,
        type: 'provenance:unlinked',
        payload: {
          edgeId,
          edge: { id: edgeId, fromAssetId, toAssetId, operation },
        },
      };
    }

    case 'provenance:unlinked': {
      const { edge } = e.payload;
      return {
        ...base,
        type: 'provenance:linked',
        payload: {
          edgeId: edge.id,
          fromAssetId: edge.fromAssetId,
          toAssetId: edge.toAssetId,
          operation: edge.operation,
        },
      };
    }

    case 'selection:set': {
      return {
        ...base,
        type: 'selection:set',
        payload: {
          selection: e.payload.previousSelection,
          previousSelection: e.payload.selection,
        },
      };
    }

    case 'selection:cleared': {
      return {
        ...base,
        type: 'selection:set',
        payload: {
          selection: e.payload.previousSelection,
          previousSelection: { type: 'none', ids: [] },
        },
      };
    }

    default:
      throw new Error(`Cannot invert unknown event type: ${(e as Event).type}`);
  }
}

export function createUndoManager(): UndoManager {
  const undoStack: UndoEntry[] = [];
  const redoStack: UndoEntry[] = [];

  return {
    record(commandId: string, events: readonly Event[]): void {
      undoStack.push({ commandId, events });
      redoStack.length = 0;
    },

    undo(): Event[] | null {
      const entry = undoStack.pop();
      if (!entry) return null;

      const compensating = entry.events.toReversed().map(invertEvent);
      redoStack.push(entry);
      return compensating;
    },

    redo(): Event[] | null {
      const entry = redoStack.pop();
      if (!entry) return null;

      // Preserve original timestamps for correct event ordering in audit views
      const reEvents = entry.events.map(e => ({ ...e, id: generateId() }));
      undoStack.push({ commandId: entry.commandId, events: reEvents });
      return reEvents;
    },

    canUndo(): boolean {
      return undoStack.length > 0;
    },

    canRedo(): boolean {
      return redoStack.length > 0;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && bun run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/undo-manager.ts packages/core/__tests__/undo-manager.test.ts
git commit -m "feat(core): undo/redo manager with compensating events"
```

---

### Task 10: CraftCore Facade

The facade wires EventStore + CommandHandler + UndoManager + State projection into one clean API.

**Files:**
- Create: `packages/core/src/core.ts`
- Create: `packages/core/__tests__/core.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/__tests__/core.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createCore } from '../src/core.js';
import type { Asset } from '../src/types.js';

describe('CraftCore', () => {
  it('starts with empty state', () => {
    const core = createCore();
    const state = core.getState();
    expect(state.registry.size).toBe(0);
    expect(state.selection.type).toBe('none');
  });

  it('dispatch registers an asset', () => {
    const core = createCore();
    core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
    });

    const state = core.getState();
    expect(state.registry.size).toBe(1);
    const asset = Array.from(state.registry.values())[0];
    expect(asset.name).toBe('Test');
  });

  it('dispatch returns the produced events', () => {
    const core = createCore();
    const events = core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('asset:registered');
  });

  it('subscribe notifies on state change', () => {
    const core = createCore();
    const listener = vi.fn();
    core.subscribe(listener);

    core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'asset:registered' }),
    );
  });

  it('unsubscribe stops notifications', () => {
    const core = createCore();
    const listener = vi.fn();
    const unsub = core.subscribe(listener);
    unsub();

    core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('undo reverses the last command', () => {
    const core = createCore();
    core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
    });
    expect(core.getState().registry.size).toBe(1);

    core.undo();
    expect(core.getState().registry.size).toBe(0);
  });

  it('redo re-applies after undo', () => {
    const core = createCore();
    core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
    });

    core.undo();
    expect(core.getState().registry.size).toBe(0);

    core.redo();
    expect(core.getState().registry.size).toBe(1);
  });

  it('canUndo/canRedo reflect state', () => {
    const core = createCore();
    expect(core.canUndo()).toBe(false);
    expect(core.canRedo()).toBe(false);

    core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
    });
    expect(core.canUndo()).toBe(true);
    expect(core.canRedo()).toBe(false);

    core.undo();
    expect(core.canUndo()).toBe(false);
    expect(core.canRedo()).toBe(true);

    core.redo();
    expect(core.canUndo()).toBe(true);
    expect(core.canRedo()).toBe(false);
  });

  it('getEvents returns all events in order', () => {
    const core = createCore();
    core.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/a.mp4', name: 'A', metadata: {} },
    });
    core.dispatch('agent', {
      type: 'asset:register',
      asset: { type: 'image', uri: '/b.png', name: 'B', metadata: {} },
    });

    const events = core.getEvents();
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('asset:registered');
    expect(events[1].type).toBe('asset:registered');
    expect(events[0].actor).toBe('human');
    expect(events[1].actor).toBe('agent');
  });

  it('throws on invalid command', () => {
    const core = createCore();
    expect(() => core.dispatch('human', {
      type: 'asset:remove', assetId: 'nonexistent',
    })).toThrow();
  });

  describe('full workflow: upload → derive → select → undo', () => {
    it('tracks provenance and supports undo', () => {
      const core = createCore();

      // Human uploads an image
      const [registered] = core.dispatch('human', {
        type: 'asset:register',
        asset: { type: 'image', uri: '/photo.jpg', name: 'Photo', metadata: { width: 3000 } },
      });
      const photoId = (registered.payload.asset as Asset).id;

      // Set provenance root
      core.dispatch('human', {
        type: 'provenance:set-root',
        assetId: photoId,
        operation: { type: 'upload', actor: 'human', timestamp: Date.now() },
      });

      // Agent generates a variant
      const [variantRegistered] = core.dispatch('agent', {
        type: 'asset:register',
        asset: { type: 'image', uri: '/photo-enhanced.jpg', name: 'Enhanced Photo', metadata: { width: 3000 } },
      });
      const variantId = (variantRegistered.payload.asset as Asset).id;

      // Link variant to parent
      core.dispatch('agent', {
        type: 'provenance:link',
        fromAssetId: photoId,
        toAssetId: variantId,
        operation: { type: 'derive', actor: 'agent', agentId: 'enhancer', timestamp: Date.now() },
      });

      // Verify state
      let state = core.getState();
      expect(state.registry.size).toBe(2);
      const parentNode = state.provenance.nodes.get(photoId)!;
      expect(parentNode.childIds).toContain(variantId);

      // Undo the link
      core.undo();
      state = core.getState();
      const parentAfterUndo = state.provenance.nodes.get(photoId)!;
      expect(parentAfterUndo.childIds).not.toContain(variantId);

      // Redo
      core.redo();
      state = core.getState();
      const parentAfterRedo = state.provenance.nodes.get(photoId)!;
      expect(parentAfterRedo.childIds).toContain(variantId);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && bun run test`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// packages/core/src/core.ts
import type {
  PneumaCraftCoreState,
  CoreCommand,
  Actor,
  Event,
  CommandEnvelope,
} from './types.js';
import { generateId } from './id.js';
import { createEventStore, type EventStore } from './event-store.js';
import { createInitialState, applyEvent } from './state.js';
import { handleCommand } from './command-handler.js';
import { createUndoManager, type UndoManager } from './undo-manager.js';

export interface CraftCore {
  getState(): PneumaCraftCoreState;
  dispatch(actor: Actor, command: CoreCommand): Event[];
  subscribe(listener: (event: Event) => void): () => void;
  undo(): Event[] | null;
  redo(): Event[] | null;
  canUndo(): boolean;
  canRedo(): boolean;
  getEvents(): Event[];
}

export function createCore(): CraftCore {
  const eventStore = createEventStore();
  const undoManager = createUndoManager();
  let state = createInitialState();

  function appendEvents(events: Event[]): void {
    for (const event of events) {
      state = applyEvent(state, event);
      eventStore.append(event);
    }
  }

  return {
    getState(): PneumaCraftCoreState {
      return state;
    },

    dispatch(actor: Actor, command: CoreCommand): Event[] {
      const envelope: CommandEnvelope = {
        id: generateId(),
        actor,
        timestamp: Date.now(),
        command,
      };

      const events = handleCommand(state, envelope);
      undoManager.record(envelope.id, events);
      appendEvents(events);
      return events;
    },

    subscribe(listener: (event: Event) => void): () => void {
      return eventStore.subscribe(listener);
    },

    undo(): Event[] | null {
      const compensating = undoManager.undo();
      if (!compensating) return null;
      appendEvents(compensating);
      return compensating;
    },

    redo(): Event[] | null {
      const redoEvents = undoManager.redo();
      if (!redoEvents) return null;
      appendEvents(redoEvents);
      return redoEvents;
    },

    canUndo(): boolean {
      return undoManager.canUndo();
    },

    canRedo(): boolean {
      return undoManager.canRedo();
    },

    getEvents(): Event[] {
      return eventStore.getAll();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && bun run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/core.ts packages/core/__tests__/core.test.ts
git commit -m "feat(core): CraftCore facade with dispatch, undo/redo, subscribe"
```

---

### Task 11: Public Exports + Build Verification

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Update index.ts with all public exports**

```typescript
// packages/core/src/index.ts

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

// ── Asset queries ───────────────────────────────────────────────────────
export { getAssetById, getAssetsByType, searchAssets } from './asset-queries.js';

// ── Typed events ────────────────────────────────────────────────────────
export { asCoreEvent } from './events.js';
export type { CoreEvent } from './events.js';

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
export { createUndoManager } from './undo-manager.js';
export type { UndoManager } from './undo-manager.js';

// ── ID generation ───────────────────────────────────────────────────────
export { generateId } from './id.js';
```

- [ ] **Step 2: Run all tests**

Run: `cd packages/core && bun run test`
Expected: ALL PASS

- [ ] **Step 3: Run typecheck**

Run: `cd packages/core && bun run typecheck`
Expected: No errors

- [ ] **Step 4: Run build**

Run: `cd packages/core && bun run build`
Expected: Build succeeds, `dist/` contains `index.js`, `index.cjs`, `index.d.ts`

- [ ] **Step 5: Verify exported API from built output**

Run: `cd packages/core && bun -e "const m = require('./dist/index.cjs'); console.log(Object.keys(m).sort().join(', '))"`
Expected output should include: `CommandValidationError, applyEvent, createCore, createEventStore, createInitialState, createUndoManager, generateId, getAssetById, getAssetsByType, getLineage, getOperationsByActor, getRoots, getTree, getVariants, handleCommand, projectState, searchAssets`

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): update public exports — @pneuma-craft/core v0.1.0 complete"
```
