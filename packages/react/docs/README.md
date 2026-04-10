# @pneuma-craft/react

React 19 bindings for pneuma-craft — Provider, hooks, and headless render-prop components. Connects the domain model to React via a Zustand store with lazy engine initialization.

## Provider Setup

Wrap your app with `PneumaCraftProvider`. It requires an `AssetResolver` to load media assets:

```tsx
import { PneumaCraftProvider } from '@pneuma-craft/react';

const resolver = {
  resolveUrl: (id: string) => `/api/assets/${id}`,
  fetchBlob: (id: string) => fetch(`/api/assets/${id}`).then(r => r.blob()),
};

function App() {
  return (
    <PneumaCraftProvider assetResolver={resolver} compositorType="auto">
      <YourEditor />
    </PneumaCraftProvider>
  );
}
```

### Provider Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `assetResolver` | `AssetResolver` | required | Resolves asset IDs to URLs/Blobs |
| `compositorType` | `'canvas2d' \| 'gpu' \| 'auto'` | `'auto'` | Compositor backend |
| `children` | `React.ReactNode` | required | App content |

Both `assetResolver` and `compositorType` are immutable after mount. To change them, set a `key` prop on the Provider to force remount.

## Hooks Reference

All hooks must be used inside a `PneumaCraftProvider`.

| Hook | Returns | Description |
|------|---------|-------------|
| `useAssets()` | `Asset[]` | All registered assets |
| `useAsset(id)` | `Asset \| undefined` | Single asset by ID |
| `useComposition()` | `Composition \| null` | Current composition |
| `useSelection()` | `Selection` | Current selection state |
| `useLineage(assetId)` | `ProvenanceEdge[]` | Provenance chain from root to asset |
| `useVariants(assetId)` | `string[]` | Direct child asset IDs |
| `useEventLog(filter?)` | `Event[]` | Filtered event log |
| `useDispatch()` | `(actor, command) => Event[]` | Dispatch core or composition commands |
| `useUndo()` | `UndoState` | `{ undo, redo, canUndo, canRedo }` |
| `usePlayback()` | `PlaybackHookState` | Full playback control and state |
| `useExport()` | `ExportHookState` | Export control, progress, abort |

### usePlayback()

```typescript
interface PlaybackHookState {
  state: PlaybackState;        // 'idle' | 'loading' | 'ready' | 'playing' | 'paused'
  currentTime: number;
  duration: number;
  playbackRate: number;
  loop: { start: number; end: number } | null;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  setLoop: (loop: { start: number; end: number } | null) => void;
}
```

### useExport()

```typescript
interface ExportHookState {
  exporting: boolean;
  progress: number;            // 0..1
  export: (options: ExportOptions) => Promise<Blob>;
  abort: () => void;
}
```

### useUndo()

```typescript
interface UndoState {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}
```

### useEventLog()

Accepts an optional `EventLogFilter`:

```typescript
interface EventLogFilter {
  actor?: Actor;
  type?: string;
  since?: number;
}
```

## Headless Components

Render-prop components that provide state without rendering any DOM. Use these to build custom UIs:

| Component | Props | State |
|-----------|-------|-------|
| `PreviewRoot` | `children: (state: PreviewState) => ReactNode` | `{ canvasRef, width, height }` |
| `TimelineRoot` | `children: (state: TimelineState) => ReactNode` | `{ composition, currentTime, duration }` |
| `AssetLibraryRoot` | `children: (state: AssetLibraryState) => ReactNode` | `{ assets, select, remove }` |
| `ProvenanceTreeRoot` | `assetId: string, children: (state: ProvenanceTreeState) => ReactNode` | `{ tree, toggleNode, expandedIds }` |

### Example: Custom Preview

```tsx
import { PreviewRoot, usePlayback } from '@pneuma-craft/react';

function CustomPreview() {
  const { state, play, pause } = usePlayback();

  return (
    <PreviewRoot>
      {({ canvasRef, width, height }) => (
        <div>
          <canvas ref={canvasRef} width={width} height={height} />
          <button onClick={state === 'playing' ? pause : play}>
            {state === 'playing' ? 'Pause' : 'Play'}
          </button>
        </div>
      )}
    </PreviewRoot>
  );
}
```

## Store Architecture

The internal Zustand store (`createPneumaCraftStore`) manages:

- **Domain state** — wraps `TimelineCore` (which extends `CraftCore`), exposing `coreState`, `composition`, undo/redo, and events
- **Playback state** — lazy `PlaybackEngine` initialization with concurrent init guard and destroyed flag
- **Export state** — lazy `ExportEngine` creation per export

The store is created once per Provider mount. The `PlaybackEngine` and `ExportEngine` are lazily imported and created on first use (`play()` or `exportComposition()`) to keep the initial bundle small.

### Key Design Decisions

- **Lazy engine init** — PlaybackEngine is not created until `play()` is called, keeping initial load fast
- **Concurrent init guard** — multiple rapid `play()` calls share a single initialization promise
- **Composition reload** — when composition changes, the playback engine automatically reloads
- **Destroyed flag** — prevents async continuations (engine init, load) from running after `destroy()`
