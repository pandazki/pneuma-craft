# @pneuma-craft/core

Event-sourced domain model for human-AI collaborative content creation. Provides the Asset Registry, Provenance Graph, and event system that all other pneuma-craft packages build on.

## Key Concepts

### Asset Registry

A `Map<string, Asset>` that serves as the single source of truth for all media assets. Each asset has a type (`video | image | audio | text`), a URI, metadata, and optional tags.

### Provenance Graph

A directed acyclic graph (DAG) tracking how assets evolved. Each node represents an asset; each edge carries an `Operation` describing the transformation (upload, generate, derive, select, composite) and which actor performed it (`human` or `agent`).

### Event Sourcing

All state changes flow through `Command → CommandHandler → Event(s) → EventStore → State`. Events are immutable facts appended to a log. State is always a projection of that log. Undo emits compensating events — the log only grows, never shrinks.

## API Overview

### `createCore(): CraftCore`

The main entry point. Returns a facade with:

| Method | Description |
|--------|-------------|
| `dispatch(actor, command)` | Validate and execute a command, returns emitted events |
| `getState()` | Current projected state (`PneumaCraftCoreState`) |
| `subscribe(listener)` | Listen for events, returns unsubscribe function |
| `undo()` | Emit compensating events for the last command |
| `redo()` | Re-apply the last undone command |
| `canUndo()` / `canRedo()` | Check undo/redo availability |
| `getEvents()` | All events in the store |

### Commands

| Command | Payload |
|---------|---------|
| `asset:register` | `{ asset: Omit<Asset, 'id' \| 'createdAt'> }` |
| `asset:remove` | `{ assetId: string }` |
| `asset:update-metadata` | `{ assetId: string, metadata: Partial<AssetMetadata> }` |
| `asset:tag` | `{ assetId: string, tags: string[] }` |
| `provenance:link` | `{ fromAssetId: string \| null, toAssetId: string, operation: Operation }` |
| `provenance:set-root` | `{ assetId: string, operation: Operation }` |
| `provenance:unlink` | `{ edgeId: string }` |
| `selection:set` | `{ selection: Selection }` |
| `selection:clear` | `{}` |

### Provenance Queries

| Function | Returns |
|----------|---------|
| `getTree(state, assetId)` | `ProvenanceTreeNode` — recursive tree from a root asset |
| `getLineage(state, assetId)` | `ProvenanceEdge[]` — chain of edges from root to asset |
| `getAncestors(state, assetId)` | `string[]` — all ancestor asset IDs |
| `getVariants(state, assetId)` | `string[]` — direct child asset IDs |
| `getRoots(state)` | `string[]` — all root asset IDs (no parents) |
| `getOperationsByActor(state, actor)` | `ProvenanceEdge[]` — all edges by a given actor |

### Asset Queries

| Function | Returns |
|----------|---------|
| `getAssetById(state, id)` | `Asset \| undefined` |
| `getAssetsByType(state, type)` | `Asset[]` |
| `searchAssets(state, query)` | `Asset[]` — name-based search |

## Example

```typescript
import { createCore, getTree, getVariants } from '@pneuma-craft/core';

const core = createCore();

// Register assets
const [photo] = core.dispatch('human', {
  type: 'asset:register',
  asset: { type: 'image', uri: '/photo.jpg', name: 'Original', metadata: {} },
});
const photoId = photo.payload.asset.id;

// Set provenance root
core.dispatch('human', {
  type: 'provenance:set-root',
  assetId: photoId,
  operation: { type: 'upload', actor: 'human', timestamp: Date.now() },
});

// Agent derives a variant
const [enhanced] = core.dispatch('agent', {
  type: 'asset:register',
  asset: { type: 'image', uri: '/enhanced.jpg', name: 'Enhanced', metadata: {} },
});
core.dispatch('agent', {
  type: 'provenance:link',
  fromAssetId: photoId,
  toAssetId: enhanced.payload.asset.id,
  operation: { type: 'derive', actor: 'agent', agentId: 'upscaler', timestamp: Date.now() },
});

// Query
const state = core.getState();
const variants = getVariants(state, photoId); // [enhanced.payload.asset.id]
const tree = getTree(state, photoId);         // { assetId, children: [...] }

// Undo
core.undo(); // reverts the provenance:link
```

## Types Reference

| Type | Description |
|------|-------------|
| `Asset` | `{ id, type, uri, name, metadata, createdAt, tags? }` |
| `AssetType` | `'video' \| 'image' \| 'audio' \| 'text'` |
| `AssetMetadata` | `{ size?, width?, height?, duration?, codec?, sampleRate?, channels?, fps? }` |
| `Actor` | `'human' \| 'agent'` |
| `Operation` | `{ type, actor, agentId?, params?, label?, timestamp }` |
| `OperationType` | `'upload' \| 'import' \| 'generate' \| 'derive' \| 'select' \| 'composite'` |
| `ProvenanceEdge` | `{ id, fromAssetId, toAssetId, operation }` |
| `ProvenanceNode` | `{ assetId, parentIds, childIds, rootOperation }` |
| `Selection` | `{ type, ids, timeRange? }` |
| `Event` | `{ id, commandId, actor, timestamp, type, payload }` |
| `PneumaCraftCoreState` | `{ registry, provenance, selection }` |
| `CraftCore` | Facade interface returned by `createCore()` |
| `ProvenanceTreeNode` | `{ assetId, children }` — used by `getTree()` |
