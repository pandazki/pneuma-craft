# @pneuma-craft/react Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Headless React 19 bindings — Provider, Zustand store, hooks, headless components
**Depends on:** @pneuma-craft/core, @pneuma-craft/timeline, @pneuma-craft/video
**Styled components:** Separate package `@pneuma-craft/react-ui` (future phase)

---

## 1. Purpose

`@pneuma-craft/react` provides headless React 19 bindings for pneuma-craft's domain model. It bridges event-sourced state (core/timeline), real-time playback (video), and React's rendering model through a single Zustand store.

**What it does:**
- `PneumaCraftProvider` — initializes engines, creates store, provides context
- Zustand store — single source of truth projecting domain + playback state
- Domain hooks — `useAssets`, `useComposition`, `useSelection`, `useLineage`, `useVariants`, `useEventLog`
- Command hooks — `useDispatch`, `useUndo`
- Playback hooks — `usePlayback`, `useExport`
- Headless components — `PreviewRoot`, `TimelineRoot`, `AssetLibraryRoot`, `ProvenanceTreeRoot`

**What it does not do:**
- Render any visible UI (that's `@pneuma-craft/react-ui`)
- Apply styles, themes, or design tokens
- Manage layout or responsive behavior

**Relationship to `@pneuma-craft/react-ui`:**
This package is the headless foundation. `react-ui` will import from `react` and add styled components with CSS custom properties (no css-in-js). The dependency direction is `react-ui → react → video → timeline → core`.

---

## 2. Architecture

### Store Design

```
PneumaCraftProvider
  └── creates Zustand store (one per provider)
        │
        ├── Domain Slice (from TimelineCore)
        │     ├── coreState: PneumaCraftCoreState
        │     ├── composition: Composition | null
        │     └── canUndo / canRedo: boolean
        │
        ├── Playback Slice (from PlaybackEngine)
        │     ├── playbackState: PlaybackState
        │     ├── currentTime: number
        │     ├── duration: number
        │     └── playbackRate: number
        │
        ├── Export Slice
        │     ├── exporting: boolean
        │     └── progress: number
        │
        └── Actions (mutate store + delegate to engines)
              ├── dispatch(actor, command)
              ├── undo() / redo()
              ├── play() / pause() / seek(time)
              ├── setPlaybackRate(rate) / setLoop(loop)
              └── exportComposition(options) / abortExport()
```

### Data Flow

```
User action (click, drag, keyboard)
     │
     ▼
Hook / Headless Component
     │ calls action
     ▼
Zustand Action
     │
     ├──► TimelineCore.dispatch(actor, command)
     │         │
     │         ├──► Events appended to EventStore
     │         └──► State projection updated
     │
     └──► Zustand setState({ coreState, composition, canUndo, canRedo })
              │
              └──► React re-renders (only subscribers with matching selectors)

PlaybackEngine.onTimeUpdate(time)
     │
     └──► Zustand setState({ currentTime: time })
              │
              └──► usePlayback() subscribers re-render
```

### Engine Lifecycle

```
Provider mount
  ├── Create TimelineCore (immediate)
  ├── Create Zustand store (immediate)
  └── PlaybackEngine: LAZY — created on first play()/seek()
        └── Requires composition to be non-null
        └── Initializes AudioContext (user gesture required in browsers)

Provider unmount
  ├── Destroy PlaybackEngine (if created)
  ├── Destroy TimelineCore
  └── Zustand store GC'd
```

PlaybackEngine is lazily initialized because:
- Creating AudioContext without user interaction is blocked by browsers
- Many use cases (asset management, provenance browsing) don't need playback
- Avoids wasting resources when only editing composition data

---

## 3. Provider

```tsx
interface PneumaCraftProviderProps {
  children: React.ReactNode;
  assetResolver: AssetResolver;
  compositorType?: CompositorType;  // default: 'auto'
}

<PneumaCraftProvider
  assetResolver={resolver}
  compositorType="auto"
>
  {children}
</PneumaCraftProvider>
```

**Initialization sequence:**
1. Create `TimelineCore` via `createTimelineCore()`
2. Create Zustand store with initial state from TimelineCore
3. Subscribe to TimelineCore events → sync to Zustand on every dispatch
4. Store `assetResolver` and `compositorType` in store for lazy PlaybackEngine creation
5. Provide store via React Context

**Cleanup on unmount:**
- Destroy PlaybackEngine (if created)
- No need to destroy TimelineCore (GC handles it, no external resources)

**Multiple Providers:**
Each `<PneumaCraftProvider>` creates an independent store + TimelineCore. Nesting is not supported — inner provider wins.

---

## 4. Zustand Store

### Store Type

```typescript
interface PneumaCraftStore {
  // ── Domain State ───────────────────────────────────────
  coreState: PneumaCraftCoreState;
  composition: Composition | null;
  canUndo: boolean;
  canRedo: boolean;

  // ── Playback State ─────────────────────────────────────
  playbackState: PlaybackState;
  currentTime: number;
  duration: number;
  playbackRate: number;
  loop: { start: number; end: number } | null;

  // ── Export State ───────────────────────────────────────
  exporting: boolean;
  exportProgress: number;

  // ── Actions ────────────────────────────────────────────
  dispatch: (actor: Actor, command: CoreCommand | CompositionCommand) => Event[];
  undo: () => Event[] | null;
  redo: () => Event[] | null;

  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  setLoop: (loop: { start: number; end: number } | null) => void;

  exportComposition: (options: ExportOptions) => Promise<Blob>;
  abortExport: () => void;
}
```

### Store Creation

The store is created inside the Provider using `createStore()` (not `create()`) because each Provider gets its own store instance. Zustand's `useStore(store, selector)` pattern is used to consume it.

```typescript
function createPneumaCraftStore(
  timelineCore: TimelineCore,
  assetResolver: AssetResolver,
  compositorType: CompositorType,
): StoreApi<PneumaCraftStore> {
  return createStore<PneumaCraftStore>((set, get) => ({
    // Initial state from TimelineCore
    coreState: timelineCore.getCoreState(),
    composition: timelineCore.getComposition(),
    canUndo: timelineCore.canUndo(),
    canRedo: timelineCore.canRedo(),

    // Playback (idle until engine created)
    playbackState: 'idle',
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    loop: null,

    // Export
    exporting: false,
    exportProgress: 0,

    // Actions ...
  }));
}
```

### PlaybackEngine Lazy Initialization

```typescript
let engine: PlaybackEngine | null = null;

async function ensureEngine(): Promise<PlaybackEngine> {
  if (engine) return engine;
  const composition = get().composition;
  if (!composition) throw new Error('No composition loaded');
  engine = createPlaybackEngine({ compositorType });
  engine.onTimeUpdate(time => set({ currentTime: time }));
  engine.onStateChange(state => set({ playbackState: state }));
  await engine.load(composition, assetResolver);
  set({ duration: composition.duration, playbackState: engine.state });
  return engine;
}
```

### Composition Sync

When `dispatch()` modifies the composition, the store action:
1. Calls `timelineCore.dispatch(actor, command)`
2. Reads new state: `getCoreState()`, `getComposition()`, `canUndo()`, `canRedo()`
3. Updates Zustand: `set({ coreState, composition, canUndo, canRedo })`
4. If PlaybackEngine exists and composition changed: `engine.load(composition, resolver)` to reload

---

## 5. Hooks

All hooks consume the Zustand store via context. Each hook uses a selector to subscribe to only the state it needs.

### Domain Hooks

```typescript
function useAssets(): readonly Asset[] {
  // Selector: extract assets from coreState.registry
  // Uses shallow compare to avoid re-render when other state changes
}

function useAsset(assetId: string): Asset | undefined {
  // Selector: single asset lookup from registry
}

function useComposition(): Composition | null {
  // Selector: composition from store
}

function useSelection(): Selection {
  // Selector: selection from coreState
}

function useLineage(assetId: string): readonly Asset[] {
  // Calls getLineage() from @pneuma-craft/core
  // Memoized — only recomputes when provenance graph changes
}

function useVariants(assetId: string): readonly Asset[] {
  // Calls getVariants() from @pneuma-craft/core
  // Memoized
}

function useEventLog(filter?: { actor?: Actor }): readonly Event[] {
  // Selector: events from timelineCore.getEvents()
  // Optional filter by actor
}
```

### Command Hooks

```typescript
function useDispatch(): (actor: Actor, command: CoreCommand | CompositionCommand) => Event[] {
  // Returns stable dispatch function from store
}

function useUndo(): {
  undo: () => Event[] | null;
  redo: () => Event[] | null;
  canUndo: boolean;
  canRedo: boolean;
} {
  // Selects canUndo/canRedo + undo/redo actions
}
```

### Playback Hooks

```typescript
function usePlayback(): {
  state: PlaybackState;
  currentTime: number;
  duration: number;
  playbackRate: number;
  loop: { start: number; end: number } | null;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  setLoop: (loop: { start: number; end: number } | null) => void;
} {
  // Selects playback slice + actions
  // currentTime updates at ~60fps via PlaybackEngine callback
}
```

### Export Hook

```typescript
function useExport(): {
  exporting: boolean;
  progress: number;
  export: (options: ExportOptions) => Promise<Blob>;
  abort: () => void;
} {
  // Selects export slice + actions
  // Creates ExportEngine on demand (not lazy like PlaybackEngine — each export is independent)
}
```

### Performance Notes

- **Selector granularity:** Each hook uses the narrowest possible selector. `useAsset(id)` only re-renders when that specific asset changes, not when any asset changes.
- **Shallow compare:** All hooks use Zustand's `shallow` equality for object/array selectors.
- **currentTime throttling:** `onTimeUpdate` from PlaybackEngine fires at rAF rate (~60fps). Zustand batches these — React only renders once per frame anyway via concurrent mode.
- **Derived state (lineage, variants):** Computed from coreState using `useMemo` with provenance graph as dependency. Not stored in Zustand to avoid stale cache.

---

## 6. Headless Components

Headless components encapsulate complex behavior (canvas lifecycle, drag gestures, tree traversal) without rendering UI. They use the **children callback** pattern.

### 6.1 PreviewRoot

```tsx
interface PreviewRootProps {
  children: (state: PreviewState) => React.ReactNode;
}

interface PreviewState {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isLoading: boolean;
  isReady: boolean;
}

<PreviewRoot>
  {({ canvasRef, isLoading, isReady }) => (
    <div>
      {isLoading && <span>Loading...</span>}
      <canvas ref={canvasRef} />
    </div>
  )}
</PreviewRoot>
```

**Internal behavior:**
- Creates a `<canvas>` ref, passes it to consumer
- Watches composition changes → calls PlaybackEngine.load()
- Subscribes to `onFrameRendered` → draws ImageBitmap to canvas
- Attaches ResizeObserver to canvas → calls compositor.resize()
- Manages canvas 2D context lifecycle (create on mount, release on unmount)
- Handles first-frame rendering after load (shows first frame before play)

### 6.2 TimelineRoot

```tsx
interface TimelineRootProps {
  pixelsPerSecond?: number;                    // default: 100
  onClipSelect?: (clipId: string) => void;
  onClipMove?: (clipId: string, newStartTime: number) => void;
  onClipTrim?: (clipId: string, edge: 'left' | 'right', newTime: number) => void;
  onSeek?: (time: number) => void;
  children: (state: TimelineState) => React.ReactNode;
}

interface TimelineState {
  tracks: readonly Track[];
  duration: number;
  playheadPosition: number;                     // in pixels
  timeToPixels: (time: number) => number;
  pixelsToTime: (pixels: number) => number;
  handlers: {
    onTrackMouseDown: (trackId: string, e: React.MouseEvent) => void;
    onPlayheadMouseDown: (e: React.MouseEvent) => void;
  };
}
```

**Internal behavior:**
- Time ↔ pixel conversion using `pixelsPerSecond`
- Clip drag gesture: mousedown → mousemove → mouseup, dispatches `composition:move-clip`
- Clip trim gesture: edge detection, dispatches `composition:trim-clip`
- Playhead scrub: mousedown on playhead → seek on mousemove
- All mutations go through `useDispatch()` → Zustand → TimelineCore

### 6.3 AssetLibraryRoot

```tsx
interface AssetLibraryRootProps {
  filter?: { type?: AssetType };
  onAssetSelect?: (assetId: string) => void;
  children: (state: AssetLibraryState) => React.ReactNode;
}

interface AssetLibraryState {
  assets: readonly Asset[];
  selectedAssetId: string | null;
  selectAsset: (assetId: string) => void;
}
```

**Internal behavior:**
- Reads assets from `useAssets()`
- Applies optional type filter
- Manages local selection state
- Calls `onAssetSelect` callback on selection change

### 6.4 ProvenanceTreeRoot

```tsx
interface ProvenanceTreeRootProps {
  assetId: string;                              // root of the tree to display
  children: (state: ProvenanceTreeState) => React.ReactNode;
}

interface ProvenanceTreeNode {
  asset: Asset;
  children: ProvenanceTreeNode[];
  expanded: boolean;
  depth: number;
}

interface ProvenanceTreeState {
  tree: ProvenanceTreeNode | null;
  expandNode: (assetId: string) => void;
  collapseNode: (assetId: string) => void;
  toggleNode: (assetId: string) => void;
}
```

**Internal behavior:**
- Calls `getTree()` from `@pneuma-craft/core` to build tree structure
- Manages expand/collapse state locally (Set<string> of expanded node IDs)
- Flattens tree with depth info for easy rendering
- Re-computes when provenance graph changes

---

## 7. File Structure

```
packages/react/
├── src/
│   ├── store.ts                    # createPneumaCraftStore + types
│   ├── provider.tsx                # PneumaCraftProvider
│   ├── context.ts                  # React Context for store
│   ├── hooks/
│   │   ├── use-assets.ts           # useAssets, useAsset
│   │   ├── use-composition.ts      # useComposition
│   │   ├── use-selection.ts        # useSelection
│   │   ├── use-provenance.ts       # useLineage, useVariants
│   │   ├── use-event-log.ts        # useEventLog
│   │   ├── use-dispatch.ts         # useDispatch
│   │   ├── use-undo.ts             # useUndo
│   │   ├── use-playback.ts         # usePlayback
│   │   ├── use-export.ts           # useExport
│   │   └── index.ts
│   ├── headless/
│   │   ├── preview-root.tsx        # PreviewRoot
│   │   ├── timeline-root.tsx       # TimelineRoot
│   │   ├── asset-library-root.tsx  # AssetLibraryRoot
│   │   ├── provenance-tree-root.tsx # ProvenanceTreeRoot
│   │   └── index.ts
│   └── index.ts                    # Public exports
├── __tests__/
│   ├── helpers.tsx                 # Test utilities, mock provider
│   ├── store.test.ts
│   ├── provider.test.tsx
│   ├── hooks/
│   │   ├── use-assets.test.ts
│   │   ├── use-composition.test.ts
│   │   ├── use-dispatch.test.ts
│   │   ├── use-undo.test.ts
│   │   ├── use-playback.test.ts
│   │   └── use-export.test.ts
│   └── headless/
│       ├── preview-root.test.tsx
│       ├── timeline-root.test.tsx
│       └── provenance-tree-root.test.tsx
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## 8. Testing Strategy

### Hooks Testing

Hooks are tested using `@testing-library/react` with `renderHook()`:

- Create a test wrapper `<PneumaCraftProvider>` with mock `AssetResolver`
- Dispatch commands, verify hook return values update
- Test selector isolation: dispatching unrelated commands doesn't trigger re-render

```typescript
const wrapper = ({ children }) => (
  <PneumaCraftProvider assetResolver={mockResolver}>
    {children}
  </PneumaCraftProvider>
);

const { result } = renderHook(() => useAssets(), { wrapper });
// dispatch → verify result.current changes
```

### Headless Component Testing

Render headless components with mock children callback, verify:
- Correct state passed to children
- Event handlers dispatch correct commands
- Canvas ref management (PreviewRoot)

### What's NOT Tested Here

- Video rendering (tested in `@pneuma-craft/video`)
- Command validation (tested in `@pneuma-craft/timeline`)
- Event sourcing (tested in `@pneuma-craft/core`)

The react package tests focus on: **correct wiring between React and the domain engines**.

---

## 9. Dependencies

```json
{
  "dependencies": {
    "@pneuma-craft/core": "workspace:*",
    "@pneuma-craft/timeline": "workspace:*",
    "@pneuma-craft/video": "workspace:*",
    "zustand": "^5.0.0"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "tsup": "^8.4.0",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  }
}
```

---

## 10. MVP Scope

**In scope:**
- PneumaCraftProvider with lazy PlaybackEngine
- Zustand store with domain + playback + export slices
- 11 hooks: useAssets, useAsset, useComposition, useSelection, useLineage, useVariants, useEventLog, useDispatch, useUndo, usePlayback, useExport
- 4 headless components: PreviewRoot, TimelineRoot, AssetLibraryRoot, ProvenanceTreeRoot
- Tests for store, hooks, and headless components

**Out of scope (future — `@pneuma-craft/react-ui`):**
- Styled components with CSS custom properties
- Design tokens / theme system
- Keyboard shortcuts
- Accessibility (ARIA)
- Responsive layout
