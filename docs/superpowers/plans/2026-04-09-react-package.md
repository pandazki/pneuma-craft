# @pneuma-craft/react Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement headless React 19 bindings — Provider, Zustand store, 11 hooks, and 4 headless components that bridge pneuma-craft's domain engines to React.

**Architecture:** Single Zustand store per Provider projecting domain state (TimelineCore) + playback state (PlaybackEngine). Hooks consume store via selectors with shallow compare. Headless components encapsulate complex behavior (canvas lifecycle, drag gestures, tree traversal) via children callback pattern.

**Tech Stack:** React 19, Zustand 5, TypeScript 5.7+ strict, Vitest, @testing-library/react

**Design Spec:** `docs/specs/2026-04-09-react-design.md`

---

## File Structure

```
packages/react/
├── src/
│   ├── store.ts                     # PneumaCraftStore type + createPneumaCraftStore()
│   ├── context.ts                   # React Context for store
│   ├── provider.tsx                 # PneumaCraftProvider component
│   ├── hooks/
│   │   ├── use-assets.ts            # useAssets(), useAsset(id)
│   │   ├── use-composition.ts       # useComposition()
│   │   ├── use-selection.ts         # useSelection()
│   │   ├── use-provenance.ts        # useLineage(id), useVariants(id)
│   │   ├── use-event-log.ts         # useEventLog(filter?)
│   │   ├── use-dispatch.ts          # useDispatch()
│   │   ├── use-undo.ts              # useUndo()
│   │   ├── use-playback.ts          # usePlayback()
│   │   ├── use-export.ts            # useExport()
│   │   └── index.ts
│   ├── headless/
│   │   ├── preview-root.tsx         # PreviewRoot
│   │   ├── timeline-root.tsx        # TimelineRoot
│   │   ├── asset-library-root.tsx   # AssetLibraryRoot
│   │   ├── provenance-tree-root.tsx # ProvenanceTreeRoot
│   │   └── index.ts
│   └── index.ts                     # Public exports (REWRITE)
├── __tests__/
│   ├── helpers.tsx                  # Test wrapper, mock resolver
│   ├── store.test.ts
│   ├── provider.test.tsx
│   ├── hooks/
│   │   ├── use-assets.test.tsx
│   │   ├── use-composition.test.tsx
│   │   ├── use-dispatch.test.tsx
│   │   ├── use-undo.test.tsx
│   │   ├── use-playback.test.tsx
│   │   └── use-export.test.tsx
│   └── headless/
│       ├── preview-root.test.tsx
│       └── timeline-root.test.tsx
├── package.json
└── tsconfig.json
```

---

### Task 1: Setup — Dependencies, Test Helpers, Store Types

Add Zustand and testing deps. Create test helpers and the store type definition.

**Files:**
- Modify: `packages/react/package.json`
- Create: `packages/react/src/store.ts`
- Create: `packages/react/__tests__/helpers.tsx`

- [ ] **Step 1: Add dependencies to package.json**

Add to `dependencies`:
```json
"zustand": "^5.0.0"
```

Add to `devDependencies`:
```json
"@testing-library/react": "^16.0.0",
"@testing-library/jest-dom": "^6.0.0",
"jsdom": "^26.0.0"
```

Also add to the root `vitest` config or `packages/react/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

Run: `bun install`

- [ ] **Step 2: Create store type definition**

```typescript
// packages/react/src/store.ts
import type { StoreApi } from 'zustand';
import type { Actor, CoreCommand, Event, PneumaCraftCoreState } from '@pneuma-craft/core';
import type { Composition, CompositionCommand } from '@pneuma-craft/timeline';
import type { PlaybackState, ExportOptions, AssetResolver } from '@pneuma-craft/video';
import type { CompositorType } from '@pneuma-craft/video';

export interface PneumaCraftStore {
  // ── Domain State ───────────────────────────────────────
  readonly coreState: PneumaCraftCoreState;
  readonly composition: Composition | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;

  // ── Playback State ─────────────────────────────────────
  readonly playbackState: PlaybackState;
  readonly currentTime: number;
  readonly duration: number;
  readonly playbackRate: number;
  readonly loop: { start: number; end: number } | null;

  // ── Export State ───────────────────────────────────────
  readonly exporting: boolean;
  readonly exportProgress: number;

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

  // ── Internal (not for direct consumer use) ─────────────
  _assetResolver: AssetResolver;
  _compositorType: CompositorType;
}

export type PneumaCraftStoreApi = StoreApi<PneumaCraftStore>;
```

- [ ] **Step 3: Create test helpers**

```typescript
// packages/react/__tests__/helpers.tsx
import React from 'react';
import { vi } from 'vitest';
import type { AssetResolver } from '@pneuma-craft/video';
import type { Asset } from '@pneuma-craft/core';

export function createMockAssetResolver(): AssetResolver {
  return {
    resolveUrl: vi.fn().mockReturnValue('http://localhost/test.mp4'),
    fetchBlob: vi.fn().mockResolvedValue(new Blob()),
  };
}

export function createMockAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-1',
    type: 'video',
    uri: '/test.mp4',
    name: 'Test Video',
    metadata: { width: 1920, height: 1080, duration: 10 },
    createdAt: Date.now(),
    ...overrides,
  };
}

// Wrapper component for hook testing — will be updated in Task 3
// when PneumaCraftProvider is implemented
export function createTestWrapper() {
  // Placeholder — replaced in Task 3
  return ({ children }: { children: React.ReactNode }) => <>{children}</>;
}
```

- [ ] **Step 4: Run build to verify setup**

Run: `cd packages/react && bun run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/react/package.json packages/react/src/store.ts packages/react/__tests__/helpers.tsx
git commit -m "feat(react): add deps, store types, and test helpers"
```

---

### Task 2: Zustand Store Creation

Implement `createPneumaCraftStore()` that creates a store instance wired to TimelineCore.

**Files:**
- Modify: `packages/react/src/store.ts`
- Create: `packages/react/__tests__/store.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/react/__tests__/store.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createPneumaCraftStore } from '../src/store.js';
import { createMockAssetResolver } from './helpers.js';

describe('createPneumaCraftStore', () => {
  it('creates a store with initial state', () => {
    const store = createPneumaCraftStore(createMockAssetResolver());
    const state = store.getState();

    expect(state.coreState).toBeDefined();
    expect(state.coreState.registry.size).toBe(0);
    expect(state.composition).toBeNull();
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(false);
    expect(state.playbackState).toBe('idle');
    expect(state.currentTime).toBe(0);
    expect(state.duration).toBe(0);
    expect(state.playbackRate).toBe(1);
    expect(state.loop).toBeNull();
    expect(state.exporting).toBe(false);
    expect(state.exportProgress).toBe(0);
  });

  it('dispatch registers an asset and updates store', () => {
    const store = createPneumaCraftStore(createMockAssetResolver());
    const events = store.getState().dispatch('human', {
      type: 'asset:register',
      asset: { type: 'image', uri: '/photo.jpg', name: 'Photo', metadata: { width: 1000 } },
    });

    expect(events.length).toBeGreaterThan(0);
    expect(store.getState().coreState.registry.size).toBe(1);
  });

  it('dispatch creates composition and updates store', () => {
    const store = createPneumaCraftStore(createMockAssetResolver());
    store.getState().dispatch('human', {
      type: 'composition:create',
      settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
    });

    expect(store.getState().composition).not.toBeNull();
    expect(store.getState().composition!.settings.width).toBe(1920);
  });

  it('undo reverses last command', () => {
    const store = createPneumaCraftStore(createMockAssetResolver());
    store.getState().dispatch('human', {
      type: 'asset:register',
      asset: { type: 'image', uri: '/photo.jpg', name: 'Photo', metadata: {} },
    });

    expect(store.getState().coreState.registry.size).toBe(1);
    expect(store.getState().canUndo).toBe(true);

    store.getState().undo();
    expect(store.getState().coreState.registry.size).toBe(0);
    expect(store.getState().canUndo).toBe(false);
  });

  it('redo re-applies after undo', () => {
    const store = createPneumaCraftStore(createMockAssetResolver());
    store.getState().dispatch('human', {
      type: 'asset:register',
      asset: { type: 'image', uri: '/photo.jpg', name: 'Photo', metadata: {} },
    });
    store.getState().undo();
    expect(store.getState().canRedo).toBe(true);

    store.getState().redo();
    expect(store.getState().coreState.registry.size).toBe(1);
  });

  it('stores asset resolver reference', () => {
    const resolver = createMockAssetResolver();
    const store = createPneumaCraftStore(resolver);
    expect(store.getState()._assetResolver).toBe(resolver);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/react && bunx vitest run __tests__/store.test.ts`
Expected: FAIL — `createPneumaCraftStore` not exported

- [ ] **Step 3: Implement store creation**

```typescript
// packages/react/src/store.ts
import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand';
import type { Actor, CoreCommand, Event, PneumaCraftCoreState } from '@pneuma-craft/core';
import type { Composition, CompositionCommand } from '@pneuma-craft/timeline';
import { createTimelineCore } from '@pneuma-craft/timeline';
import type { PlaybackState, ExportOptions, AssetResolver, PlaybackEngine, ExportEngine } from '@pneuma-craft/video';
import type { CompositorType } from '@pneuma-craft/video';

export interface PneumaCraftStore {
  // ── Domain State ───────────────────────────────────────
  readonly coreState: PneumaCraftCoreState;
  readonly composition: Composition | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;

  // ── Playback State ─────────────────────────────────────
  readonly playbackState: PlaybackState;
  readonly currentTime: number;
  readonly duration: number;
  readonly playbackRate: number;
  readonly loop: { start: number; end: number } | null;

  // ── Export State ───────────────────────────────────────
  readonly exporting: boolean;
  readonly exportProgress: number;

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

  // ── Internal ───────────────────────────────────────────
  _assetResolver: AssetResolver;
  _compositorType: CompositorType;
}

export type PneumaCraftStoreApi = StoreApi<PneumaCraftStore>;

export function createPneumaCraftStore(
  assetResolver: AssetResolver,
  compositorType: CompositorType = 'auto',
): PneumaCraftStoreApi {
  const timelineCore = createTimelineCore();
  let playbackEngine: PlaybackEngine | null = null;
  let exportEngine: ExportEngine | null = null;

  function syncDomainState(set: StoreApi<PneumaCraftStore>['setState']) {
    set({
      coreState: timelineCore.getCoreState(),
      composition: timelineCore.getComposition(),
      canUndo: timelineCore.canUndo(),
      canRedo: timelineCore.canRedo(),
    });
  }

  async function ensurePlaybackEngine(
    get: StoreApi<PneumaCraftStore>['getState'],
    set: StoreApi<PneumaCraftStore>['setState'],
  ): Promise<PlaybackEngine> {
    if (playbackEngine) return playbackEngine;

    const composition = get().composition;
    if (!composition) throw new Error('No composition loaded. Create a composition first.');

    // Dynamic import to avoid loading video engine when not needed
    const { createPlaybackEngine } = await import('@pneuma-craft/video');
    playbackEngine = createPlaybackEngine({ compositorType: get()._compositorType });

    playbackEngine.onTimeUpdate((time) => set({ currentTime: time }));
    playbackEngine.onStateChange((state) => set({ playbackState: state }));

    await playbackEngine.load(composition, get()._assetResolver);
    set({ duration: composition.duration, playbackState: playbackEngine.state });

    return playbackEngine;
  }

  return createStore<PneumaCraftStore>((set, get) => ({
    // Initial domain state
    coreState: timelineCore.getCoreState(),
    composition: timelineCore.getComposition(),
    canUndo: timelineCore.canUndo(),
    canRedo: timelineCore.canRedo(),

    // Initial playback state
    playbackState: 'idle' as PlaybackState,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    loop: null,

    // Initial export state
    exporting: false,
    exportProgress: 0,

    // Internal
    _assetResolver: assetResolver,
    _compositorType: compositorType,

    // ── Domain Actions ─────────────────────────────────────
    dispatch(actor, command) {
      const events = timelineCore.dispatch(actor, command);
      syncDomainState(set);

      // Reload playback engine if composition changed
      const newComposition = timelineCore.getComposition();
      if (playbackEngine && newComposition) {
        playbackEngine.load(newComposition, get()._assetResolver).catch(() => {});
        set({ duration: newComposition.duration });
      }

      return events;
    },

    undo() {
      const events = timelineCore.undo();
      syncDomainState(set);
      return events;
    },

    redo() {
      const events = timelineCore.redo();
      syncDomainState(set);
      return events;
    },

    // ── Playback Actions ───────────────────────────────────
    async play() {
      try {
        const engine = await ensurePlaybackEngine(get, set);
        engine.play();
      } catch (err) {
        console.error('[PneumaCraft] Failed to start playback:', err);
      }
    },

    pause() {
      playbackEngine?.pause();
    },

    seek(time) {
      if (playbackEngine) {
        playbackEngine.seek(time);
      } else {
        set({ currentTime: time });
      }
    },

    setPlaybackRate(rate) {
      set({ playbackRate: rate });
      if (playbackEngine) {
        playbackEngine.playbackRate = rate;
      }
    },

    setLoop(loop) {
      set({ loop });
      if (playbackEngine) {
        playbackEngine.loop = loop;
      }
    },

    // ── Export Actions ──────────────────────────────────────
    async exportComposition(options) {
      const composition = get().composition;
      if (!composition) throw new Error('No composition to export');

      const { createExportEngine } = await import('@pneuma-craft/video');
      exportEngine = createExportEngine();

      const unsubProgress = exportEngine.onProgress((progress) => {
        set({ exportProgress: progress });
      });

      set({ exporting: true, exportProgress: 0 });

      try {
        const blob = await exportEngine.export(composition, options, get()._assetResolver);
        return blob;
      } finally {
        set({ exporting: false, exportProgress: 0 });
        unsubProgress();
        exportEngine = null;
      }
    },

    abortExport() {
      exportEngine?.abort();
    },
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/react && bunx vitest run __tests__/store.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/store.ts packages/react/__tests__/store.test.ts
git commit -m "feat(react): implement Zustand store with TimelineCore integration"
```

---

### Task 3: Context + Provider

Create the React Context and PneumaCraftProvider component.

**Files:**
- Create: `packages/react/src/context.ts`
- Create: `packages/react/src/provider.tsx`
- Create: `packages/react/__tests__/provider.test.tsx`
- Modify: `packages/react/__tests__/helpers.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/react/__tests__/provider.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PneumaCraftProvider } from '../src/provider.js';
import { createMockAssetResolver } from './helpers.js';

describe('PneumaCraftProvider', () => {
  it('renders children', () => {
    render(
      <PneumaCraftProvider assetResolver={createMockAssetResolver()}>
        <div data-testid="child">Hello</div>
      </PneumaCraftProvider>,
    );
    expect(screen.getByTestId('child')).toBeDefined();
  });

  it('provides store context to children', () => {
    // This will be tested indirectly through hooks in later tasks
    render(
      <PneumaCraftProvider assetResolver={createMockAssetResolver()}>
        <div>Test</div>
      </PneumaCraftProvider>,
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/react && bunx vitest run __tests__/provider.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement context and provider**

```typescript
// packages/react/src/context.ts
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { PneumaCraftStore, PneumaCraftStoreApi } from './store.js';

export const PneumaCraftContext = createContext<PneumaCraftStoreApi | null>(null);

export function usePneumaCraftStore<T>(selector: (state: PneumaCraftStore) => T): T {
  const store = useContext(PneumaCraftContext);
  if (!store) {
    throw new Error('usePneumaCraftStore must be used within a <PneumaCraftProvider>');
  }
  return useStore(store, selector);
}
```

```tsx
// packages/react/src/provider.tsx
import React, { useRef, useEffect } from 'react';
import type { AssetResolver } from '@pneuma-craft/video';
import type { CompositorType } from '@pneuma-craft/video';
import { PneumaCraftContext } from './context.js';
import { createPneumaCraftStore } from './store.js';
import type { PneumaCraftStoreApi } from './store.js';

export interface PneumaCraftProviderProps {
  children: React.ReactNode;
  assetResolver: AssetResolver;
  compositorType?: CompositorType;
}

export function PneumaCraftProvider({
  children,
  assetResolver,
  compositorType = 'auto',
}: PneumaCraftProviderProps): React.ReactElement {
  const storeRef = useRef<PneumaCraftStoreApi | null>(null);

  if (!storeRef.current) {
    storeRef.current = createPneumaCraftStore(assetResolver, compositorType);
  }

  return (
    <PneumaCraftContext.Provider value={storeRef.current}>
      {children}
    </PneumaCraftContext.Provider>
  );
}
```

- [ ] **Step 4: Update test helpers with working wrapper**

```typescript
// packages/react/__tests__/helpers.tsx
import React from 'react';
import { vi } from 'vitest';
import type { AssetResolver } from '@pneuma-craft/video';
import type { Asset } from '@pneuma-craft/core';
import { PneumaCraftProvider } from '../src/provider.js';

export function createMockAssetResolver(): AssetResolver {
  return {
    resolveUrl: vi.fn().mockReturnValue('http://localhost/test.mp4'),
    fetchBlob: vi.fn().mockResolvedValue(new Blob()),
  };
}

export function createMockAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-1',
    type: 'video',
    uri: '/test.mp4',
    name: 'Test Video',
    metadata: { width: 1920, height: 1080, duration: 10 },
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createTestWrapper(resolver?: AssetResolver) {
  const assetResolver = resolver ?? createMockAssetResolver();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <PneumaCraftProvider assetResolver={assetResolver}>
        {children}
      </PneumaCraftProvider>
    );
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/react && bunx vitest run __tests__/provider.test.tsx`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/context.ts packages/react/src/provider.tsx packages/react/__tests__/provider.test.tsx packages/react/__tests__/helpers.tsx
git commit -m "feat(react): implement PneumaCraftProvider and context"
```

---

### Task 4: Domain Hooks — useAssets, useAsset, useComposition, useSelection

**Files:**
- Create: `packages/react/src/hooks/use-assets.ts`
- Create: `packages/react/src/hooks/use-composition.ts`
- Create: `packages/react/src/hooks/use-selection.ts`
- Create: `packages/react/__tests__/hooks/use-assets.test.tsx`
- Create: `packages/react/__tests__/hooks/use-composition.test.tsx`

- [ ] **Step 1: Write failing tests for useAssets and useAsset**

```typescript
// packages/react/__tests__/hooks/use-assets.test.tsx
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAssets, useAsset } from '../../src/hooks/use-assets.js';
import { useDispatch } from '../../src/hooks/use-dispatch.js';
import { createTestWrapper } from '../helpers.js';

describe('useAssets', () => {
  it('returns empty array initially', () => {
    const { result } = renderHook(() => useAssets(), { wrapper: createTestWrapper() });
    expect(result.current).toEqual([]);
  });

  it('returns assets after dispatch', () => {
    const wrapper = createTestWrapper();
    const { result: assetsResult } = renderHook(() => useAssets(), { wrapper });
    const { result: dispatchResult } = renderHook(() => useDispatch(), { wrapper });

    act(() => {
      dispatchResult.current('human', {
        type: 'asset:register',
        asset: { type: 'image', uri: '/photo.jpg', name: 'Photo', metadata: {} },
      });
    });

    expect(assetsResult.current.length).toBe(1);
    expect(assetsResult.current[0].name).toBe('Photo');
  });
});

describe('useAsset', () => {
  it('returns undefined for unknown id', () => {
    const { result } = renderHook(() => useAsset('unknown'), { wrapper: createTestWrapper() });
    expect(result.current).toBeUndefined();
  });

  it('returns asset by id', () => {
    const wrapper = createTestWrapper();
    const { result: dispatchResult } = renderHook(() => useDispatch(), { wrapper });

    let assetId = '';
    act(() => {
      const events = dispatchResult.current('human', {
        type: 'asset:register',
        asset: { type: 'image', uri: '/photo.jpg', name: 'Photo', metadata: {} },
      });
      assetId = events[0].payload.asset.id;
    });

    const { result } = renderHook(() => useAsset(assetId), { wrapper });
    expect(result.current).toBeDefined();
    expect(result.current!.name).toBe('Photo');
  });
});
```

- [ ] **Step 2: Write failing test for useComposition**

```typescript
// packages/react/__tests__/hooks/use-composition.test.tsx
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComposition } from '../../src/hooks/use-composition.js';
import { useDispatch } from '../../src/hooks/use-dispatch.js';
import { createTestWrapper } from '../helpers.js';

describe('useComposition', () => {
  it('returns null initially', () => {
    const { result } = renderHook(() => useComposition(), { wrapper: createTestWrapper() });
    expect(result.current).toBeNull();
  });

  it('returns composition after creation', () => {
    const wrapper = createTestWrapper();
    const { result: compResult } = renderHook(() => useComposition(), { wrapper });
    const { result: dispatchResult } = renderHook(() => useDispatch(), { wrapper });

    act(() => {
      dispatchResult.current('human', {
        type: 'composition:create',
        settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
      });
    });

    expect(compResult.current).not.toBeNull();
    expect(compResult.current!.settings.width).toBe(1920);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/react && bunx vitest run __tests__/hooks/`
Expected: FAIL

- [ ] **Step 4: Implement hooks**

```typescript
// packages/react/src/hooks/use-assets.ts
import { useShallow } from 'zustand/react/shallow';
import { usePneumaCraftStore } from '../context.js';
import type { Asset } from '@pneuma-craft/core';

export function useAssets(): readonly Asset[] {
  return usePneumaCraftStore(
    useShallow((state) => Array.from(state.coreState.registry.values())),
  );
}

export function useAsset(assetId: string): Asset | undefined {
  return usePneumaCraftStore(
    (state) => state.coreState.registry.get(assetId),
  );
}
```

```typescript
// packages/react/src/hooks/use-composition.ts
import { usePneumaCraftStore } from '../context.js';
import type { Composition } from '@pneuma-craft/timeline';

export function useComposition(): Composition | null {
  return usePneumaCraftStore((state) => state.composition);
}
```

```typescript
// packages/react/src/hooks/use-selection.ts
import { usePneumaCraftStore } from '../context.js';
import type { Selection } from '@pneuma-craft/core';

export function useSelection(): Selection {
  return usePneumaCraftStore((state) => state.coreState.selection);
}
```

Also create `useDispatch` early since tests depend on it:

```typescript
// packages/react/src/hooks/use-dispatch.ts
import { usePneumaCraftStore } from '../context.js';
import type { Actor, CoreCommand, Event } from '@pneuma-craft/core';
import type { CompositionCommand } from '@pneuma-craft/timeline';

export function useDispatch(): (actor: Actor, command: CoreCommand | CompositionCommand) => Event[] {
  return usePneumaCraftStore((state) => state.dispatch);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/react && bunx vitest run __tests__/hooks/`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/hooks/ packages/react/__tests__/hooks/
git commit -m "feat(react): implement useAssets, useAsset, useComposition, useSelection, useDispatch"
```

---

### Task 5: Command Hooks — useDispatch, useUndo

**Files:**
- Modify: `packages/react/src/hooks/use-dispatch.ts` (already created in Task 4)
- Create: `packages/react/src/hooks/use-undo.ts`
- Create: `packages/react/__tests__/hooks/use-dispatch.test.tsx`
- Create: `packages/react/__tests__/hooks/use-undo.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/react/__tests__/hooks/use-dispatch.test.tsx
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDispatch } from '../../src/hooks/use-dispatch.js';
import { useAssets } from '../../src/hooks/use-assets.js';
import { createTestWrapper } from '../helpers.js';

describe('useDispatch', () => {
  it('returns a stable dispatch function', () => {
    const { result, rerender } = renderHook(() => useDispatch(), { wrapper: createTestWrapper() });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('dispatch returns events', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(() => useDispatch(), { wrapper });

    let events: unknown[];
    act(() => {
      events = result.current('human', {
        type: 'asset:register',
        asset: { type: 'image', uri: '/test.jpg', name: 'Test', metadata: {} },
      });
    });

    expect(events!.length).toBe(1);
  });

  it('dispatch updates asset state', () => {
    const wrapper = createTestWrapper();
    const { result: dispatch } = renderHook(() => useDispatch(), { wrapper });
    const { result: assets } = renderHook(() => useAssets(), { wrapper });

    act(() => {
      dispatch.current('agent', {
        type: 'asset:register',
        asset: { type: 'audio', uri: '/music.mp3', name: 'Music', metadata: {} },
      });
    });

    expect(assets.current.length).toBe(1);
    expect(assets.current[0].name).toBe('Music');
  });
});
```

```typescript
// packages/react/__tests__/hooks/use-undo.test.tsx
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndo } from '../../src/hooks/use-undo.js';
import { useDispatch } from '../../src/hooks/use-dispatch.js';
import { useAssets } from '../../src/hooks/use-assets.js';
import { createTestWrapper } from '../helpers.js';

describe('useUndo', () => {
  it('canUndo and canRedo start false', () => {
    const { result } = renderHook(() => useUndo(), { wrapper: createTestWrapper() });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('canUndo becomes true after dispatch', () => {
    const wrapper = createTestWrapper();
    const { result: undo } = renderHook(() => useUndo(), { wrapper });
    const { result: dispatch } = renderHook(() => useDispatch(), { wrapper });

    act(() => {
      dispatch.current('human', {
        type: 'asset:register',
        asset: { type: 'image', uri: '/test.jpg', name: 'Test', metadata: {} },
      });
    });

    expect(undo.current.canUndo).toBe(true);
  });

  it('undo reverses last action', () => {
    const wrapper = createTestWrapper();
    const { result: undo } = renderHook(() => useUndo(), { wrapper });
    const { result: dispatch } = renderHook(() => useDispatch(), { wrapper });
    const { result: assets } = renderHook(() => useAssets(), { wrapper });

    act(() => {
      dispatch.current('human', {
        type: 'asset:register',
        asset: { type: 'image', uri: '/test.jpg', name: 'Test', metadata: {} },
      });
    });

    expect(assets.current.length).toBe(1);

    act(() => { undo.current.undo(); });

    expect(assets.current.length).toBe(0);
    expect(undo.current.canRedo).toBe(true);
  });

  it('redo re-applies after undo', () => {
    const wrapper = createTestWrapper();
    const { result: undo } = renderHook(() => useUndo(), { wrapper });
    const { result: dispatch } = renderHook(() => useDispatch(), { wrapper });
    const { result: assets } = renderHook(() => useAssets(), { wrapper });

    act(() => {
      dispatch.current('human', {
        type: 'asset:register',
        asset: { type: 'image', uri: '/test.jpg', name: 'Test', metadata: {} },
      });
    });
    act(() => { undo.current.undo(); });
    act(() => { undo.current.redo(); });

    expect(assets.current.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/react && bunx vitest run __tests__/hooks/use-undo.test.tsx`
Expected: FAIL — `useUndo` not found

- [ ] **Step 3: Implement useUndo**

```typescript
// packages/react/src/hooks/use-undo.ts
import { useShallow } from 'zustand/react/shallow';
import { usePneumaCraftStore } from '../context.js';
import type { Event } from '@pneuma-craft/core';

export interface UndoState {
  undo: () => Event[] | null;
  redo: () => Event[] | null;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndo(): UndoState {
  return usePneumaCraftStore(
    useShallow((state) => ({
      undo: state.undo,
      redo: state.redo,
      canUndo: state.canUndo,
      canRedo: state.canRedo,
    })),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/react && bunx vitest run __tests__/hooks/`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/hooks/ packages/react/__tests__/hooks/
git commit -m "feat(react): implement useDispatch and useUndo hooks"
```

---

### Task 6: Provenance + Event Log Hooks

**Files:**
- Create: `packages/react/src/hooks/use-provenance.ts`
- Create: `packages/react/src/hooks/use-event-log.ts`

- [ ] **Step 1: Implement useLineage, useVariants, useEventLog**

```typescript
// packages/react/src/hooks/use-provenance.ts
import { useMemo } from 'react';
import { usePneumaCraftStore } from '../context.js';
import { getLineage, getVariants } from '@pneuma-craft/core';
import type { Asset } from '@pneuma-craft/core';

export function useLineage(assetId: string): readonly Asset[] {
  const coreState = usePneumaCraftStore((state) => state.coreState);
  return useMemo(() => getLineage(coreState, assetId), [coreState, assetId]);
}

export function useVariants(assetId: string): readonly Asset[] {
  const coreState = usePneumaCraftStore((state) => state.coreState);
  return useMemo(() => getVariants(coreState, assetId), [coreState, assetId]);
}
```

```typescript
// packages/react/src/hooks/use-event-log.ts
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePneumaCraftStore } from '../context.js';
import type { Actor, Event } from '@pneuma-craft/core';

export interface EventLogFilter {
  actor?: Actor;
}

export function useEventLog(filter?: EventLogFilter): readonly Event[] {
  const events = usePneumaCraftStore(
    useShallow((state) => {
      // Access events from coreState — TimelineCore stores them in its event store
      // We need to get them through a selector that reads the store's event count
      // to avoid unnecessary re-renders
      return state.coreState;
    }),
  );

  // Events aren't directly in coreState — they're in TimelineCore.getEvents()
  // We'll access them through the store's internal event list
  // For now, return empty array — this will be connected when we wire up events
  return useMemo(() => [], [events, filter]);
}
```

Actually, events aren't stored in PneumaCraftCoreState — they're in TimelineCore's EventStore. Let me adjust the store to expose events:

- [ ] **Step 2: Add events to store**

In `packages/react/src/store.ts`, add to the store interface:

```typescript
readonly events: readonly Event[];
```

And in `createPneumaCraftStore`, add to initial state:
```typescript
events: timelineCore.getEvents(),
```

And in `syncDomainState`:
```typescript
events: timelineCore.getEvents(),
```

Then implement useEventLog properly:

```typescript
// packages/react/src/hooks/use-event-log.ts
import { useMemo } from 'react';
import { usePneumaCraftStore } from '../context.js';
import type { Actor, Event } from '@pneuma-craft/core';

export interface EventLogFilter {
  actor?: Actor;
}

export function useEventLog(filter?: EventLogFilter): readonly Event[] {
  const events = usePneumaCraftStore((state) => state.events);

  return useMemo(() => {
    if (!filter?.actor) return events;
    return events.filter((e) => e.actor === filter.actor);
  }, [events, filter?.actor]);
}
```

- [ ] **Step 3: Run tests**

Run: `cd packages/react && bunx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/react/src/hooks/ packages/react/src/store.ts
git commit -m "feat(react): implement useLineage, useVariants, useEventLog hooks"
```

---

### Task 7: Playback Hook — usePlayback

**Files:**
- Create: `packages/react/src/hooks/use-playback.ts`
- Create: `packages/react/__tests__/hooks/use-playback.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/react/__tests__/hooks/use-playback.test.tsx
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePlayback } from '../../src/hooks/use-playback.js';
import { createTestWrapper } from '../helpers.js';

describe('usePlayback', () => {
  it('returns initial playback state', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper: createTestWrapper() });

    expect(result.current.state).toBe('idle');
    expect(result.current.currentTime).toBe(0);
    expect(result.current.duration).toBe(0);
    expect(result.current.playbackRate).toBe(1);
    expect(result.current.loop).toBeNull();
  });

  it('returns playback control functions', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper: createTestWrapper() });

    expect(result.current.play).toBeTypeOf('function');
    expect(result.current.pause).toBeTypeOf('function');
    expect(result.current.seek).toBeTypeOf('function');
    expect(result.current.setPlaybackRate).toBeTypeOf('function');
    expect(result.current.setLoop).toBeTypeOf('function');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/react && bunx vitest run __tests__/hooks/use-playback.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement usePlayback**

```typescript
// packages/react/src/hooks/use-playback.ts
import { useShallow } from 'zustand/react/shallow';
import { usePneumaCraftStore } from '../context.js';
import type { PlaybackState } from '@pneuma-craft/video';

export interface PlaybackHookState {
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
}

export function usePlayback(): PlaybackHookState {
  return usePneumaCraftStore(
    useShallow((state) => ({
      state: state.playbackState,
      currentTime: state.currentTime,
      duration: state.duration,
      playbackRate: state.playbackRate,
      loop: state.loop,
      play: state.play,
      pause: state.pause,
      seek: state.seek,
      setPlaybackRate: state.setPlaybackRate,
      setLoop: state.setLoop,
    })),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/react && bunx vitest run __tests__/hooks/use-playback.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/hooks/use-playback.ts packages/react/__tests__/hooks/use-playback.test.tsx
git commit -m "feat(react): implement usePlayback hook"
```

---

### Task 8: Export Hook — useExport

**Files:**
- Create: `packages/react/src/hooks/use-export.ts`
- Create: `packages/react/__tests__/hooks/use-export.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/react/__tests__/hooks/use-export.test.tsx
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useExport } from '../../src/hooks/use-export.js';
import { createTestWrapper } from '../helpers.js';

describe('useExport', () => {
  it('returns initial export state', () => {
    const { result } = renderHook(() => useExport(), { wrapper: createTestWrapper() });

    expect(result.current.exporting).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(result.current.export).toBeTypeOf('function');
    expect(result.current.abort).toBeTypeOf('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/react && bunx vitest run __tests__/hooks/use-export.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement useExport**

```typescript
// packages/react/src/hooks/use-export.ts
import { useShallow } from 'zustand/react/shallow';
import { usePneumaCraftStore } from '../context.js';
import type { ExportOptions } from '@pneuma-craft/video';

export interface ExportHookState {
  exporting: boolean;
  progress: number;
  export: (options: ExportOptions) => Promise<Blob>;
  abort: () => void;
}

export function useExport(): ExportHookState {
  return usePneumaCraftStore(
    useShallow((state) => ({
      exporting: state.exporting,
      progress: state.exportProgress,
      export: state.exportComposition,
      abort: state.abortExport,
    })),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/react && bunx vitest run __tests__/hooks/use-export.test.tsx`
Expected: PASS

- [ ] **Step 5: Create hooks index**

```typescript
// packages/react/src/hooks/index.ts
export { useAssets, useAsset } from './use-assets.js';
export { useComposition } from './use-composition.js';
export { useSelection } from './use-selection.js';
export { useLineage, useVariants } from './use-provenance.js';
export { useEventLog } from './use-event-log.js';
export type { EventLogFilter } from './use-event-log.js';
export { useDispatch } from './use-dispatch.js';
export { useUndo } from './use-undo.js';
export type { UndoState } from './use-undo.js';
export { usePlayback } from './use-playback.js';
export type { PlaybackHookState } from './use-playback.js';
export { useExport } from './use-export.js';
export type { ExportHookState } from './use-export.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/hooks/ packages/react/__tests__/hooks/
git commit -m "feat(react): implement useExport hook + hooks index"
```

---

### Task 9: Headless Component — PreviewRoot

**Files:**
- Create: `packages/react/src/headless/preview-root.tsx`
- Create: `packages/react/__tests__/headless/preview-root.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/react/__tests__/headless/preview-root.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PreviewRoot } from '../../src/headless/preview-root.js';
import { createTestWrapper } from '../helpers.js';
import { PneumaCraftProvider } from '../../src/provider.js';
import { createMockAssetResolver } from '../helpers.js';

describe('PreviewRoot', () => {
  it('renders children with preview state', () => {
    const childFn = vi.fn().mockReturnValue(<div data-testid="preview">Preview</div>);

    render(
      <PneumaCraftProvider assetResolver={createMockAssetResolver()}>
        <PreviewRoot>{childFn}</PreviewRoot>
      </PneumaCraftProvider>,
    );

    expect(childFn).toHaveBeenCalled();
    const state = childFn.mock.calls[0][0];
    expect(state.canvasRef).toBeDefined();
    expect(state.isLoading).toBe(false);
    expect(state.isReady).toBe(false);
  });

  it('provides a canvas ref', () => {
    render(
      <PneumaCraftProvider assetResolver={createMockAssetResolver()}>
        <PreviewRoot>
          {({ canvasRef }) => <canvas ref={canvasRef} data-testid="canvas" />}
        </PreviewRoot>
      </PneumaCraftProvider>,
    );

    expect(screen.getByTestId('canvas')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/react && bunx vitest run __tests__/headless/preview-root.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement PreviewRoot**

```tsx
// packages/react/src/headless/preview-root.tsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { usePneumaCraftStore } from '../context.js';
import type { RenderedFrame } from '@pneuma-craft/video';

export interface PreviewState {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isLoading: boolean;
  isReady: boolean;
}

export interface PreviewRootProps {
  children: (state: PreviewState) => React.ReactNode;
}

export function PreviewRoot({ children }: PreviewRootProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const playbackState = usePneumaCraftStore((state) => state.playbackState);
  const composition = usePneumaCraftStore((state) => state.composition);

  useEffect(() => {
    setIsLoading(playbackState === 'loading');
    setIsReady(playbackState === 'ready' || playbackState === 'playing' || playbackState === 'paused');
  }, [playbackState]);

  // Canvas 2D context management
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    ctxRef.current = canvas.getContext('2d');

    if (composition) {
      canvas.width = composition.settings.width;
      canvas.height = composition.settings.height;
    }
  }, [composition]);

  return <>{children({ canvasRef, isLoading, isReady })}</>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/react && bunx vitest run __tests__/headless/preview-root.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/headless/preview-root.tsx packages/react/__tests__/headless/preview-root.test.tsx
git commit -m "feat(react): implement PreviewRoot headless component"
```

---

### Task 10: Headless Component — TimelineRoot

**Files:**
- Create: `packages/react/src/headless/timeline-root.tsx`
- Create: `packages/react/__tests__/headless/timeline-root.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/react/__tests__/headless/timeline-root.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { TimelineRoot } from '../../src/headless/timeline-root.js';
import { PneumaCraftProvider } from '../../src/provider.js';
import { createMockAssetResolver } from '../helpers.js';

function renderTimeline(props: Partial<React.ComponentProps<typeof TimelineRoot>> = {}) {
  const childFn = vi.fn().mockReturnValue(<div>Timeline</div>);
  const result = render(
    <PneumaCraftProvider assetResolver={createMockAssetResolver()}>
      <TimelineRoot {...props}>{childFn}</TimelineRoot>
    </PneumaCraftProvider>,
  );
  return { childFn, ...result };
}

describe('TimelineRoot', () => {
  it('renders children with timeline state', () => {
    const { childFn } = renderTimeline();

    expect(childFn).toHaveBeenCalled();
    const state = childFn.mock.calls[0][0];
    expect(state.tracks).toEqual([]);
    expect(state.duration).toBe(0);
    expect(state.playheadPosition).toBe(0);
    expect(state.timeToPixels).toBeTypeOf('function');
    expect(state.pixelsToTime).toBeTypeOf('function');
  });

  it('converts time to pixels with default pixelsPerSecond', () => {
    const { childFn } = renderTimeline({ pixelsPerSecond: 100 });
    const state = childFn.mock.calls[0][0];

    expect(state.timeToPixels(1)).toBe(100);
    expect(state.timeToPixels(2.5)).toBe(250);
  });

  it('converts pixels to time', () => {
    const { childFn } = renderTimeline({ pixelsPerSecond: 100 });
    const state = childFn.mock.calls[0][0];

    expect(state.pixelsToTime(100)).toBe(1);
    expect(state.pixelsToTime(250)).toBe(2.5);
  });

  it('uses custom pixelsPerSecond', () => {
    const { childFn } = renderTimeline({ pixelsPerSecond: 50 });
    const state = childFn.mock.calls[0][0];

    expect(state.timeToPixels(1)).toBe(50);
    expect(state.pixelsToTime(50)).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/react && bunx vitest run __tests__/headless/timeline-root.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement TimelineRoot**

```tsx
// packages/react/src/headless/timeline-root.tsx
import React, { useCallback, useMemo } from 'react';
import { usePneumaCraftStore } from '../context.js';
import type { Track } from '@pneuma-craft/timeline';

export interface TimelineState {
  tracks: readonly Track[];
  duration: number;
  playheadPosition: number;
  timeToPixels: (time: number) => number;
  pixelsToTime: (pixels: number) => number;
}

export interface TimelineRootProps {
  pixelsPerSecond?: number;
  onClipSelect?: (clipId: string) => void;
  onClipMove?: (clipId: string, newStartTime: number) => void;
  onClipTrim?: (clipId: string, edge: 'left' | 'right', newTime: number) => void;
  onSeek?: (time: number) => void;
  children: (state: TimelineState) => React.ReactNode;
}

export function TimelineRoot({
  pixelsPerSecond = 100,
  children,
}: TimelineRootProps): React.ReactElement {
  const composition = usePneumaCraftStore((state) => state.composition);
  const currentTime = usePneumaCraftStore((state) => state.currentTime);

  const tracks = composition?.tracks ?? [];
  const duration = composition?.duration ?? 0;

  const timeToPixels = useCallback(
    (time: number) => time * pixelsPerSecond,
    [pixelsPerSecond],
  );

  const pixelsToTime = useCallback(
    (pixels: number) => pixels / pixelsPerSecond,
    [pixelsPerSecond],
  );

  const playheadPosition = useMemo(
    () => currentTime * pixelsPerSecond,
    [currentTime, pixelsPerSecond],
  );

  const state: TimelineState = {
    tracks,
    duration,
    playheadPosition,
    timeToPixels,
    pixelsToTime,
  };

  return <>{children(state)}</>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/react && bunx vitest run __tests__/headless/timeline-root.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/headless/timeline-root.tsx packages/react/__tests__/headless/timeline-root.test.tsx
git commit -m "feat(react): implement TimelineRoot headless component"
```

---

### Task 11: Headless Components — AssetLibraryRoot + ProvenanceTreeRoot

**Files:**
- Create: `packages/react/src/headless/asset-library-root.tsx`
- Create: `packages/react/src/headless/provenance-tree-root.tsx`
- Create: `packages/react/src/headless/index.ts`

- [ ] **Step 1: Implement AssetLibraryRoot**

```tsx
// packages/react/src/headless/asset-library-root.tsx
import React, { useState, useCallback, useMemo } from 'react';
import { useAssets } from '../hooks/use-assets.js';
import type { Asset, AssetType } from '@pneuma-craft/core';

export interface AssetLibraryState {
  assets: readonly Asset[];
  selectedAssetId: string | null;
  selectAsset: (assetId: string) => void;
}

export interface AssetLibraryRootProps {
  filter?: { type?: AssetType };
  onAssetSelect?: (assetId: string) => void;
  children: (state: AssetLibraryState) => React.ReactNode;
}

export function AssetLibraryRoot({
  filter,
  onAssetSelect,
  children,
}: AssetLibraryRootProps): React.ReactElement {
  const allAssets = useAssets();
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const assets = useMemo(() => {
    if (!filter?.type) return allAssets;
    return allAssets.filter((a) => a.type === filter.type);
  }, [allAssets, filter?.type]);

  const selectAsset = useCallback(
    (assetId: string) => {
      setSelectedAssetId(assetId);
      onAssetSelect?.(assetId);
    },
    [onAssetSelect],
  );

  return <>{children({ assets, selectedAssetId, selectAsset })}</>;
}
```

- [ ] **Step 2: Implement ProvenanceTreeRoot**

```tsx
// packages/react/src/headless/provenance-tree-root.tsx
import React, { useState, useCallback, useMemo } from 'react';
import { usePneumaCraftStore } from '../context.js';
import { getTree } from '@pneuma-craft/core';
import type { ProvenanceTreeNode as CoreTreeNode } from '@pneuma-craft/core';

export interface ProvenanceTreeNode {
  assetId: string;
  children: ProvenanceTreeNode[];
  expanded: boolean;
  depth: number;
}

export interface ProvenanceTreeState {
  tree: ProvenanceTreeNode | null;
  expandNode: (assetId: string) => void;
  collapseNode: (assetId: string) => void;
  toggleNode: (assetId: string) => void;
}

export interface ProvenanceTreeRootProps {
  assetId: string;
  children: (state: ProvenanceTreeState) => React.ReactNode;
}

function buildTreeNode(
  coreNode: CoreTreeNode,
  expandedSet: Set<string>,
  depth: number,
): ProvenanceTreeNode {
  const expanded = expandedSet.has(coreNode.assetId);
  return {
    assetId: coreNode.assetId,
    expanded,
    depth,
    children: expanded
      ? coreNode.children.map((child) => buildTreeNode(child, expandedSet, depth + 1))
      : [],
  };
}

export function ProvenanceTreeRoot({
  assetId,
  children,
}: ProvenanceTreeRootProps): React.ReactElement {
  const coreState = usePneumaCraftStore((state) => state.coreState);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set([assetId]));

  const tree = useMemo(() => {
    const coreTree = getTree(coreState, assetId);
    if (!coreTree) return null;
    return buildTreeNode(coreTree, expandedIds, 0);
  }, [coreState, assetId, expandedIds]);

  const expandNode = useCallback((id: string) => {
    setExpandedIds((prev) => new Set([...prev, id]));
  }, []);

  const collapseNode = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleNode = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return <>{children({ tree, expandNode, collapseNode, toggleNode })}</>;
}
```

- [ ] **Step 3: Create headless index**

```typescript
// packages/react/src/headless/index.ts
export { PreviewRoot } from './preview-root.js';
export type { PreviewRootProps, PreviewState } from './preview-root.js';
export { TimelineRoot } from './timeline-root.js';
export type { TimelineRootProps, TimelineState } from './timeline-root.js';
export { AssetLibraryRoot } from './asset-library-root.js';
export type { AssetLibraryRootProps, AssetLibraryState } from './asset-library-root.js';
export { ProvenanceTreeRoot } from './provenance-tree-root.js';
export type { ProvenanceTreeRootProps, ProvenanceTreeState, ProvenanceTreeNode } from './provenance-tree-root.js';
```

- [ ] **Step 4: Run all tests**

Run: `cd packages/react && bunx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/headless/
git commit -m "feat(react): implement AssetLibraryRoot and ProvenanceTreeRoot headless components"
```

---

### Task 12: Public API + Build + README

Wire up all exports, verify build, run full monorepo tests, update README.

**Files:**
- Rewrite: `packages/react/src/index.ts`
- Modify: `README.md`

- [ ] **Step 1: Rewrite index.ts with all exports**

```typescript
// packages/react/src/index.ts

// ── Provider ───────────────────────────────────────────────────────────
export { PneumaCraftProvider } from './provider.js';
export type { PneumaCraftProviderProps } from './provider.js';

// ── Store ──────────────────────────────────────────────────────────────
export { createPneumaCraftStore } from './store.js';
export type { PneumaCraftStore, PneumaCraftStoreApi } from './store.js';

// ── Context ────────────────────────────────────────────────────────────
export { usePneumaCraftStore } from './context.js';

// ── Hooks ──────────────────────────────────────────────────────────────
export {
  useAssets,
  useAsset,
  useComposition,
  useSelection,
  useLineage,
  useVariants,
  useEventLog,
  useDispatch,
  useUndo,
  usePlayback,
  useExport,
} from './hooks/index.js';

export type { EventLogFilter } from './hooks/index.js';
export type { UndoState } from './hooks/index.js';
export type { PlaybackHookState } from './hooks/index.js';
export type { ExportHookState } from './hooks/index.js';

// ── Headless Components ────────────────────────────────────────────────
export {
  PreviewRoot,
  TimelineRoot,
  AssetLibraryRoot,
  ProvenanceTreeRoot,
} from './headless/index.js';

export type {
  PreviewRootProps,
  PreviewState,
  TimelineRootProps,
  TimelineState,
  AssetLibraryRootProps,
  AssetLibraryState,
  ProvenanceTreeRootProps,
  ProvenanceTreeState,
  ProvenanceTreeNode,
} from './headless/index.js';

// ── Re-exported types from domain packages ─────────────────────────────
export type { Asset, AssetType, Actor, Selection, Event, CoreCommand } from '@pneuma-craft/core';
export type { Composition, Track, Clip, CompositionSettings, CompositionCommand } from '@pneuma-craft/timeline';
export type { PlaybackState, ExportOptions, AssetResolver } from '@pneuma-craft/video';
```

- [ ] **Step 2: Run all react tests**

Run: `cd packages/react && bunx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Build the package**

Run: `cd packages/react && bun run build`
Expected: Build succeeds (ESM + CJS + .d.ts)

- [ ] **Step 4: Run full monorepo build + test**

Run: `bun run build && bun run test`
Expected: All packages build and test

- [ ] **Step 5: Update README status table**

Change:
```markdown
| `@pneuma-craft/react` | Scaffolded | Types only |
```
to:
```markdown
| `@pneuma-craft/react` | **Implemented** | Headless React 19 bindings — Provider, hooks, headless components |
```

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/index.ts README.md
git commit -m "feat(react): wire up public API exports + update README"
```
