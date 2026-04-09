# @pneuma-craft/timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the complete @pneuma-craft/timeline package — composition model, clip resolution, command handler with event sourcing, and TimelineCore facade that composes with core.

**Architecture:** Timeline extends core's event-sourced protocol via composition. It exports its own command handler, state projection, and event inverter. `TimelineCore` facade composes core primitives (`createEventStore`, `handleCommand`, `applyEvent`) + timeline's own handlers into a unified dispatch/undo/redo surface. Core is not modified except for exporting `invertCoreEvent` and making `createUndoManager` accept a custom inverter function.

**Tech Stack:** TypeScript 5.7+ strict, Vitest, @pneuma-craft/core (workspace dependency). No additional runtime dependencies.

---

## File Structure

```
packages/core/src/
├── undo-manager.ts           # (modify) Export invertCoreEvent, parameterize createUndoManager
└── index.ts                  # (modify) Add invertCoreEvent export

packages/timeline/
├── src/
│   ├── types.ts              # (modify) Add split-clip command
│   ├── events.ts             # CompositionEvent discriminated union
│   ├── composition-helpers.ts # Immutable update helpers + computeDuration
│   ├── resolve-frame.ts      # resolveFrame function
│   ├── command-handler.ts    # handleCompositionCommand (9 commands)
│   ├── state.ts              # createInitialCompositionState, applyCompositionEvent
│   ├── undo.ts               # invertCompositionEvent
│   ├── timeline-core.ts      # TimelineCore facade
│   └── index.ts              # Public exports
├── __tests__/
│   ├── helpers.ts            # Mock factories (createMockComposition, etc.)
│   ├── composition-helpers.test.ts
│   ├── resolve-frame.test.ts
│   ├── command-handler.test.ts
│   ├── state.test.ts
│   ├── undo.test.ts
│   └── timeline-core.test.ts
├── docs/
│   └── composition-commands.md
└── package.json
```

---

### Task 1: Core Modification — Export invertCoreEvent

Make `createUndoManager` accept an optional custom inverter so TimelineCore can handle both core and composition events.

**Files:**
- Modify: `packages/core/src/undo-manager.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Refactor undo-manager.ts**

Rename the private `invertEvent` to `invertCoreEvent` and export it. Make `createUndoManager` accept an optional `invertFn` parameter:

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

export function invertCoreEvent(event: Event): Event {
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
      return { ...base, type: 'asset:metadata-updated', payload: {
        assetId: e.payload.assetId, metadata: e.payload.previousMetadata, previousMetadata: e.payload.metadata,
      }};
    }
    case 'asset:tagged': {
      return { ...base, type: 'asset:tagged', payload: {
        assetId: e.payload.assetId, tags: e.payload.previousTags, previousTags: e.payload.tags,
      }};
    }
    case 'provenance:root-set': {
      const { assetId, operation, edgeId } = e.payload;
      return { ...base, type: 'provenance:unlinked', payload: {
        edgeId, edge: { id: edgeId, fromAssetId: null, toAssetId: assetId, operation },
      }};
    }
    case 'provenance:linked': {
      const { edgeId, fromAssetId, toAssetId, operation } = e.payload;
      return { ...base, type: 'provenance:unlinked', payload: {
        edgeId, edge: { id: edgeId, fromAssetId, toAssetId, operation },
      }};
    }
    case 'provenance:unlinked': {
      const { edge } = e.payload;
      return { ...base, type: 'provenance:linked', payload: {
        edgeId: edge.id, fromAssetId: edge.fromAssetId, toAssetId: edge.toAssetId, operation: edge.operation,
      }};
    }
    case 'selection:set': {
      return { ...base, type: 'selection:set', payload: {
        selection: e.payload.previousSelection, previousSelection: e.payload.selection,
      }};
    }
    case 'selection:cleared': {
      return { ...base, type: 'selection:set', payload: {
        selection: e.payload.previousSelection, previousSelection: { type: 'none', ids: [] },
      }};
    }
    default:
      throw new Error(`Cannot invert unknown event type: ${(e as Event).type}`);
  }
}

export function createUndoManager(
  invertFn?: (event: Event) => Event,
): UndoManager {
  const invert = invertFn ?? invertCoreEvent;
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
      const compensating = [...entry.events].reverse().map(invert);
      redoStack.push(entry);
      return compensating;
    },
    redo(): Event[] | null {
      const entry = redoStack.pop();
      if (!entry) return null;
      const reEvents = entry.events.map(e => ({ ...e, id: generateId() }));
      undoStack.push({ commandId: entry.commandId, events: reEvents });
      return reEvents;
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
  };
}
```

- [ ] **Step 2: Update core index.ts — add invertCoreEvent export**

Add to `packages/core/src/index.ts` in the undo manager section:

```typescript
// ── Undo manager ────────────────────────────────────────────────────────
export { createUndoManager, invertCoreEvent } from './undo-manager.js';
export type { UndoManager } from './undo-manager.js';
```

- [ ] **Step 3: Run core tests**

Run: `cd packages/core && bun run test`
Expected: ALL 86 tests PASS (no behavior change, just rename + parameterize)

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/undo-manager.ts packages/core/src/index.ts
git commit -m "refactor(core): export invertCoreEvent, parameterize createUndoManager"
```

---

### Task 2: Types Update + Typed Events

**Files:**
- Modify: `packages/timeline/src/types.ts`
- Create: `packages/timeline/src/events.ts`

- [ ] **Step 1: Add split-clip to CompositionCommand**

Add to the `CompositionCommand` union in `packages/timeline/src/types.ts`:

```typescript
export type CompositionCommand =
  | { type: 'composition:create'; settings: CompositionSettings }
  | { type: 'composition:add-track'; track: Omit<Track, 'id'> }
  | { type: 'composition:remove-track'; trackId: string }
  | { type: 'composition:add-clip'; trackId: string; clip: Omit<Clip, 'id' | 'trackId'> }
  | { type: 'composition:remove-clip'; clipId: string }
  | { type: 'composition:move-clip'; clipId: string; startTime: number; trackId?: string }
  | { type: 'composition:trim-clip'; clipId: string; inPoint?: number; outPoint?: number; duration?: number }
  | { type: 'composition:split-clip'; clipId: string; time: number }
  | { type: 'composition:reorder-tracks'; trackIds: string[] };
```

- [ ] **Step 2: Create typed event union**

```typescript
// packages/timeline/src/events.ts
import type { Composition, Track, Clip } from './types.js';

interface CompositionCreatedEvent {
  readonly type: 'composition:created';
  readonly payload: { readonly composition: Composition };
}

interface CompositionTrackAddedEvent {
  readonly type: 'composition:track-added';
  readonly payload: { readonly track: Track };
}

interface CompositionTrackRemovedEvent {
  readonly type: 'composition:track-removed';
  readonly payload: { readonly trackId: string; readonly track: Track };
}

interface CompositionClipAddedEvent {
  readonly type: 'composition:clip-added';
  readonly payload: { readonly trackId: string; readonly clip: Clip };
}

interface CompositionClipRemovedEvent {
  readonly type: 'composition:clip-removed';
  readonly payload: { readonly clipId: string; readonly clip: Clip; readonly trackId: string };
}

interface CompositionClipMovedEvent {
  readonly type: 'composition:clip-moved';
  readonly payload: {
    readonly clipId: string;
    readonly startTime: number;
    readonly trackId: string | undefined;
    readonly previousStartTime: number;
    readonly previousTrackId: string;
  };
}

interface CompositionClipTrimmedEvent {
  readonly type: 'composition:clip-trimmed';
  readonly payload: {
    readonly clipId: string;
    readonly inPoint: number;
    readonly outPoint: number;
    readonly duration: number;
    readonly previousInPoint: number;
    readonly previousOutPoint: number;
    readonly previousDuration: number;
  };
}

interface CompositionClipSplitEvent {
  readonly type: 'composition:clip-split';
  readonly payload: {
    readonly clipId: string;
    readonly time: number;
    readonly newClipId: string;
    readonly leftClip: Clip;
    readonly rightClip: Clip;
    readonly originalClip: Clip;
  };
}

interface CompositionTracksReorderedEvent {
  readonly type: 'composition:tracks-reordered';
  readonly payload: {
    readonly trackIds: string[];
    readonly previousTrackIds: string[];
  };
}

export type CompositionEvent =
  | CompositionCreatedEvent
  | CompositionTrackAddedEvent
  | CompositionTrackRemovedEvent
  | CompositionClipAddedEvent
  | CompositionClipRemovedEvent
  | CompositionClipMovedEvent
  | CompositionClipTrimmedEvent
  | CompositionClipSplitEvent
  | CompositionTracksReorderedEvent;

export function asCompositionEvent(
  event: { type: string; payload: Record<string, unknown> },
): CompositionEvent {
  return event as CompositionEvent;
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd packages/timeline && bun run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/timeline/src/types.ts packages/timeline/src/events.ts
git commit -m "feat(timeline): add split-clip command + typed CompositionEvent union"
```

---

### Task 3: Test Helpers + Composition Helpers

**Files:**
- Create: `packages/timeline/__tests__/helpers.ts`
- Create: `packages/timeline/src/composition-helpers.ts`
- Create: `packages/timeline/__tests__/composition-helpers.test.ts`

- [ ] **Step 1: Create test helpers (mock factories)**

```typescript
// packages/timeline/__tests__/helpers.ts
import type { Composition, CompositionSettings, Track, Clip } from '../src/types.js';

export const defaultSettings: CompositionSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  aspectRatio: '16:9',
};

export function createMockClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
    assetId: 'asset-1',
    trackId: 'track-1',
    startTime: 0,
    duration: 5,
    inPoint: 0,
    outPoint: 5,
    ...overrides,
  };
}

export function createMockTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    type: 'video',
    name: 'Video 1',
    clips: [],
    muted: false,
    volume: 1,
    locked: false,
    ...overrides,
  };
}

export function createMockComposition(overrides: Partial<Composition> = {}): Composition {
  return {
    id: 'comp-1',
    settings: defaultSettings,
    tracks: [],
    transitions: [],
    duration: 0,
    ...overrides,
  };
}
```

- [ ] **Step 2: Write composition helpers tests**

```typescript
// packages/timeline/__tests__/composition-helpers.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeDuration,
  recomputeDuration,
  addClipToTrack,
  removeClipFromComposition,
  updateClipInComposition,
  findClipById,
  findTrackByClipId,
} from '../src/composition-helpers.js';
import { createMockComposition, createMockTrack, createMockClip } from './helpers.js';

describe('computeDuration', () => {
  it('returns 0 for empty composition', () => {
    const comp = createMockComposition();
    expect(computeDuration(comp)).toBe(0);
  });

  it('returns max clip end time', () => {
    const comp = createMockComposition({
      tracks: [
        createMockTrack({
          clips: [
            createMockClip({ startTime: 0, duration: 5 }),
            createMockClip({ id: 'c2', startTime: 10, duration: 3 }),
          ],
        }),
      ],
    });
    expect(computeDuration(comp)).toBe(13);
  });

  it('considers all tracks', () => {
    const comp = createMockComposition({
      tracks: [
        createMockTrack({ id: 't1', clips: [createMockClip({ startTime: 0, duration: 5 })] }),
        createMockTrack({ id: 't2', clips: [createMockClip({ id: 'c2', trackId: 't2', startTime: 10, duration: 10 })] }),
      ],
    });
    expect(computeDuration(comp)).toBe(20);
  });
});

describe('recomputeDuration', () => {
  it('returns composition with updated duration', () => {
    const comp = createMockComposition({
      duration: 999,
      tracks: [createMockTrack({ clips: [createMockClip({ startTime: 0, duration: 7 })] })],
    });
    const updated = recomputeDuration(comp);
    expect(updated.duration).toBe(7);
    expect(updated).not.toBe(comp);
  });
});

describe('addClipToTrack', () => {
  it('adds clip and sorts by startTime', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({
        clips: [
          createMockClip({ id: 'c1', startTime: 0, duration: 3 }),
          createMockClip({ id: 'c3', startTime: 10, duration: 5 }),
        ],
      })],
    });
    const newClip = createMockClip({ id: 'c2', startTime: 5, duration: 3 });
    const updated = addClipToTrack(comp, 'track-1', newClip);
    const clipIds = updated.tracks[0].clips.map(c => c.id);
    expect(clipIds).toEqual(['c1', 'c2', 'c3']);
  });

  it('throws if track not found', () => {
    const comp = createMockComposition();
    expect(() => addClipToTrack(comp, 'nope', createMockClip())).toThrow();
  });
});

describe('removeClipFromComposition', () => {
  it('removes clip from its track', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({ clips: [createMockClip({ id: 'c1' })] })],
    });
    const updated = removeClipFromComposition(comp, 'c1');
    expect(updated.tracks[0].clips).toHaveLength(0);
  });
});

describe('updateClipInComposition', () => {
  it('updates clip with updater function', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({ clips: [createMockClip({ id: 'c1', startTime: 0 })] })],
    });
    const updated = updateClipInComposition(comp, 'c1', clip => ({ ...clip, startTime: 10 }));
    expect(updated.tracks[0].clips[0].startTime).toBe(10);
  });

  it('re-sorts clips after update', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({
        clips: [
          createMockClip({ id: 'c1', startTime: 0 }),
          createMockClip({ id: 'c2', startTime: 5 }),
        ],
      })],
    });
    const updated = updateClipInComposition(comp, 'c1', clip => ({ ...clip, startTime: 10 }));
    expect(updated.tracks[0].clips.map(c => c.id)).toEqual(['c2', 'c1']);
  });
});

describe('findClipById', () => {
  it('returns clip and track', () => {
    const clip = createMockClip({ id: 'c1' });
    const track = createMockTrack({ clips: [clip] });
    const comp = createMockComposition({ tracks: [track] });
    const result = findClipById(comp, 'c1');
    expect(result).toBeDefined();
    expect(result!.clip.id).toBe('c1');
    expect(result!.track.id).toBe('track-1');
  });

  it('returns undefined for unknown clip', () => {
    const comp = createMockComposition();
    expect(findClipById(comp, 'nope')).toBeUndefined();
  });
});

describe('findTrackByClipId', () => {
  it('returns the track containing the clip', () => {
    const comp = createMockComposition({
      tracks: [createMockTrack({ clips: [createMockClip({ id: 'c1' })] })],
    });
    const track = findTrackByClipId(comp, 'c1');
    expect(track).toBeDefined();
    expect(track!.id).toBe('track-1');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/timeline && bun run test`
Expected: FAIL

- [ ] **Step 4: Write implementation**

```typescript
// packages/timeline/src/composition-helpers.ts
import type { Composition, Track, Clip } from './types.js';

export function computeDuration(composition: Composition): number {
  let max = 0;
  for (const track of composition.tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > max) max = end;
    }
  }
  return max;
}

export function recomputeDuration(composition: Composition): Composition {
  return { ...composition, duration: computeDuration(composition) };
}

function sortClips(clips: readonly Clip[]): Clip[] {
  return [...clips].sort((a, b) => a.startTime - b.startTime);
}

export function addClipToTrack(
  composition: Composition,
  trackId: string,
  clip: Clip,
): Composition {
  let found = false;
  const tracks = composition.tracks.map(track => {
    if (track.id !== trackId) return track;
    found = true;
    return { ...track, clips: sortClips([...track.clips, clip]) };
  });
  if (!found) throw new Error(`Track not found: ${trackId}`);
  return { ...composition, tracks };
}

export function removeClipFromComposition(
  composition: Composition,
  clipId: string,
): Composition {
  return {
    ...composition,
    tracks: composition.tracks.map(track => ({
      ...track,
      clips: track.clips.filter(c => c.id !== clipId),
    })),
  };
}

export function updateClipInComposition(
  composition: Composition,
  clipId: string,
  updater: (clip: Clip) => Clip,
): Composition {
  return {
    ...composition,
    tracks: composition.tracks.map(track => {
      const hasClip = track.clips.some(c => c.id === clipId);
      if (!hasClip) return track;
      return {
        ...track,
        clips: sortClips(track.clips.map(c => c.id === clipId ? updater(c) : c)),
      };
    }),
  };
}

export function findClipById(
  composition: Composition,
  clipId: string,
): { clip: Clip; track: Track } | undefined {
  for (const track of composition.tracks) {
    const clip = track.clips.find(c => c.id === clipId);
    if (clip) return { clip, track };
  }
  return undefined;
}

export function findTrackByClipId(
  composition: Composition,
  clipId: string,
): Track | undefined {
  return composition.tracks.find(track => track.clips.some(c => c.id === clipId));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/timeline && bun run test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/timeline/__tests__/helpers.ts packages/timeline/src/composition-helpers.ts packages/timeline/__tests__/composition-helpers.test.ts
git commit -m "feat(timeline): test helpers + composition immutable update helpers"
```

---

### Task 4: resolveFrame

**Files:**
- Create: `packages/timeline/src/resolve-frame.ts`
- Create: `packages/timeline/__tests__/resolve-frame.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/timeline/__tests__/resolve-frame.test.ts
import { describe, it, expect } from 'vitest';
import { resolveFrame } from '../src/resolve-frame.js';
import { createMockComposition, createMockTrack, createMockClip } from './helpers.js';

describe('resolveFrame', () => {
  it('returns empty clips for empty composition', () => {
    const comp = createMockComposition();
    const frame = resolveFrame(comp, 0);
    expect(frame.time).toBe(0);
    expect(frame.clips).toEqual([]);
  });

  it('resolves active clip at given time', () => {
    const clip = createMockClip({ startTime: 2, duration: 5, inPoint: 0, outPoint: 5 });
    const track = createMockTrack({ clips: [clip] });
    const comp = createMockComposition({ tracks: [track] });

    const frame = resolveFrame(comp, 4);
    expect(frame.clips).toHaveLength(1);
    expect(frame.clips[0].clip.id).toBe('clip-1');
    expect(frame.clips[0].localTime).toBe(2); // inPoint + (4 - 2)
  });

  it('uses half-open interval [start, end)', () => {
    const clip = createMockClip({ startTime: 0, duration: 5 });
    const track = createMockTrack({ clips: [clip] });
    const comp = createMockComposition({ tracks: [track] });

    // At exact start — included
    expect(resolveFrame(comp, 0).clips).toHaveLength(1);
    // Just before end — included
    expect(resolveFrame(comp, 4.999).clips).toHaveLength(1);
    // At exact end — excluded
    expect(resolveFrame(comp, 5).clips).toHaveLength(0);
  });

  it('computes localTime with inPoint offset', () => {
    const clip = createMockClip({ startTime: 10, duration: 5, inPoint: 3, outPoint: 8 });
    const track = createMockTrack({ clips: [clip] });
    const comp = createMockComposition({ tracks: [track] });

    const frame = resolveFrame(comp, 12);
    // localTime = inPoint + (time - startTime) = 3 + (12 - 10) = 5
    expect(frame.clips[0].localTime).toBe(5);
  });

  it('skips muted tracks', () => {
    const clip = createMockClip({ startTime: 0, duration: 10 });
    const mutedTrack = createMockTrack({ muted: true, clips: [clip] });
    const comp = createMockComposition({ tracks: [mutedTrack] });

    const frame = resolveFrame(comp, 5);
    expect(frame.clips).toHaveLength(0);
  });

  it('returns clips from multiple tracks in order', () => {
    const clip1 = createMockClip({ id: 'c1', trackId: 't1', startTime: 0, duration: 10 });
    const clip2 = createMockClip({ id: 'c2', trackId: 't2', startTime: 0, duration: 10 });
    const track1 = createMockTrack({ id: 't1', clips: [clip1] });
    const track2 = createMockTrack({ id: 't2', clips: [clip2] });
    const comp = createMockComposition({ tracks: [track1, track2] });

    const frame = resolveFrame(comp, 5);
    expect(frame.clips).toHaveLength(2);
    expect(frame.clips[0].track.id).toBe('t1');
    expect(frame.clips[1].track.id).toBe('t2');
  });

  it('handles gap between clips', () => {
    const clip1 = createMockClip({ id: 'c1', startTime: 0, duration: 3 });
    const clip2 = createMockClip({ id: 'c2', startTime: 6, duration: 3 });
    const track = createMockTrack({ clips: [clip1, clip2] });
    const comp = createMockComposition({ tracks: [track] });

    // In the gap
    expect(resolveFrame(comp, 4).clips).toHaveLength(0);
    // In second clip
    expect(resolveFrame(comp, 7).clips).toHaveLength(1);
    expect(resolveFrame(comp, 7).clips[0].clip.id).toBe('c2');
  });

  it('resolves multiple clips on same track at same time (overlapping)', () => {
    const clip1 = createMockClip({ id: 'c1', startTime: 0, duration: 10 });
    const clip2 = createMockClip({ id: 'c2', startTime: 5, duration: 10 });
    const track = createMockTrack({ clips: [clip1, clip2] });
    const comp = createMockComposition({ tracks: [track] });

    const frame = resolveFrame(comp, 7);
    expect(frame.clips).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/timeline && bun run test`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// packages/timeline/src/resolve-frame.ts
import type { Composition, ResolvedFrame } from './types.js';

export function resolveFrame(composition: Composition, time: number): ResolvedFrame {
  const clips: ResolvedFrame['clips'] = [];

  for (const track of composition.tracks) {
    if (track.muted) continue;

    for (const clip of track.clips) {
      const clipEnd = clip.startTime + clip.duration;
      // Half-open interval: [start, end)
      if (time >= clip.startTime && time < clipEnd) {
        const localTime = clip.inPoint + (time - clip.startTime);
        clips.push({ clip, track, localTime });
      }
    }
  }

  return { time, clips };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/timeline && bun run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/timeline/src/resolve-frame.ts packages/timeline/__tests__/resolve-frame.test.ts
git commit -m "feat(timeline): resolveFrame with half-open interval"
```

---

### Task 5: Command Handler

**Files:**
- Create: `packages/timeline/src/command-handler.ts`
- Create: `packages/timeline/__tests__/command-handler.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/timeline/__tests__/command-handler.test.ts
import { describe, it, expect } from 'vitest';
import { handleCompositionCommand } from '../src/command-handler.js';
import { createInitialState, type PneumaCraftCoreState } from '@pneuma-craft/core';
import type { CommandEnvelope } from '@pneuma-craft/core';
import type { CompositionCommand, Composition, Track, Clip } from '../src/types.js';
import type { CompositionState } from '../src/state.js';
import { createMockComposition, createMockTrack, createMockClip, defaultSettings } from './helpers.js';

function makeEnvelope(command: CompositionCommand): CommandEnvelope<CompositionCommand> {
  return { id: 'cmd-1', actor: 'human', timestamp: 1000, command };
}

function stateWith(composition: Composition | null): CompositionState {
  return { composition };
}

function coreWithAsset(assetId: string): PneumaCraftCoreState {
  const state = createInitialState();
  const registry = new Map(state.registry);
  registry.set(assetId, {
    id: assetId, type: 'video', uri: '/test.mp4', name: 'Test',
    metadata: {}, createdAt: 1000,
  });
  return { ...state, registry };
}

const coreState = createInitialState();
const emptyCompState = stateWith(null);

describe('composition:create', () => {
  it('produces composition:created event', () => {
    const events = handleCompositionCommand(coreState, emptyCompState, makeEnvelope({
      type: 'composition:create', settings: defaultSettings,
    }));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('composition:created');
    expect(events[0].payload.composition).toBeDefined();
  });

  it('throws if composition already exists', () => {
    const compState = stateWith(createMockComposition());
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:create', settings: defaultSettings,
    }))).toThrow();
  });
});

describe('composition:add-track', () => {
  it('produces composition:track-added event with generated id', () => {
    const compState = stateWith(createMockComposition());
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:add-track',
      track: { type: 'video', name: 'V1', clips: [], muted: false, volume: 1, locked: false },
    }));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('composition:track-added');
    const track = events[0].payload.track as Track;
    expect(track.id).toBeDefined();
    expect(track.name).toBe('V1');
  });

  it('throws if no composition', () => {
    expect(() => handleCompositionCommand(coreState, emptyCompState, makeEnvelope({
      type: 'composition:add-track',
      track: { type: 'video', name: 'V1', clips: [], muted: false, volume: 1, locked: false },
    }))).toThrow();
  });
});

describe('composition:remove-track', () => {
  it('produces composition:track-removed event with full track data', () => {
    const track = createMockTrack({ id: 't1' });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:remove-track', trackId: 't1',
    }));
    expect(events[0].type).toBe('composition:track-removed');
    expect(events[0].payload.track).toEqual(track);
  });

  it('throws if track has clips', () => {
    const track = createMockTrack({ clips: [createMockClip()] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:remove-track', trackId: 'track-1',
    }))).toThrow();
  });

  it('throws if track not found', () => {
    const compState = stateWith(createMockComposition());
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:remove-track', trackId: 'nope',
    }))).toThrow();
  });
});

describe('composition:add-clip', () => {
  it('produces composition:clip-added event', () => {
    const track = createMockTrack({ id: 't1' });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const core = coreWithAsset('asset-1');
    const events = handleCompositionCommand(core, compState, makeEnvelope({
      type: 'composition:add-clip', trackId: 't1',
      clip: { assetId: 'asset-1', startTime: 0, duration: 5, inPoint: 0, outPoint: 5 },
    }));
    expect(events[0].type).toBe('composition:clip-added');
    const clip = events[0].payload.clip as Clip;
    expect(clip.id).toBeDefined();
    expect(clip.trackId).toBe('t1');
  });

  it('throws if track locked', () => {
    const track = createMockTrack({ id: 't1', locked: true });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const core = coreWithAsset('asset-1');
    expect(() => handleCompositionCommand(core, compState, makeEnvelope({
      type: 'composition:add-clip', trackId: 't1',
      clip: { assetId: 'asset-1', startTime: 0, duration: 5, inPoint: 0, outPoint: 5 },
    }))).toThrow();
  });

  it('throws if assetId not in core registry', () => {
    const track = createMockTrack({ id: 't1' });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:add-clip', trackId: 't1',
      clip: { assetId: 'nope', startTime: 0, duration: 5, inPoint: 0, outPoint: 5 },
    }))).toThrow();
  });
});

describe('composition:remove-clip', () => {
  it('produces composition:clip-removed event with full clip data', () => {
    const clip = createMockClip({ id: 'c1' });
    const track = createMockTrack({ clips: [clip] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:remove-clip', clipId: 'c1',
    }));
    expect(events[0].type).toBe('composition:clip-removed');
    expect(events[0].payload.clip).toEqual(clip);
    expect(events[0].payload.trackId).toBe('track-1');
  });

  it('throws if track locked', () => {
    const clip = createMockClip({ id: 'c1' });
    const track = createMockTrack({ locked: true, clips: [clip] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:remove-clip', clipId: 'c1',
    }))).toThrow();
  });
});

describe('composition:move-clip', () => {
  it('produces composition:clip-moved event', () => {
    const clip = createMockClip({ id: 'c1', startTime: 0 });
    const track = createMockTrack({ clips: [clip] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:move-clip', clipId: 'c1', startTime: 10,
    }));
    expect(events[0].type).toBe('composition:clip-moved');
    expect(events[0].payload.startTime).toBe(10);
    expect(events[0].payload.previousStartTime).toBe(0);
  });

  it('moves clip to different track', () => {
    const clip = createMockClip({ id: 'c1', trackId: 't1' });
    const t1 = createMockTrack({ id: 't1', clips: [clip] });
    const t2 = createMockTrack({ id: 't2' });
    const compState = stateWith(createMockComposition({ tracks: [t1, t2] }));
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:move-clip', clipId: 'c1', startTime: 5, trackId: 't2',
    }));
    expect(events[0].payload.trackId).toBe('t2');
    expect(events[0].payload.previousTrackId).toBe('t1');
  });

  it('throws if target track locked', () => {
    const clip = createMockClip({ id: 'c1', trackId: 't1' });
    const t1 = createMockTrack({ id: 't1', clips: [clip] });
    const t2 = createMockTrack({ id: 't2', locked: true });
    const compState = stateWith(createMockComposition({ tracks: [t1, t2] }));
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:move-clip', clipId: 'c1', startTime: 5, trackId: 't2',
    }))).toThrow();
  });
});

describe('composition:trim-clip', () => {
  it('produces composition:clip-trimmed event with previous values', () => {
    const clip = createMockClip({ id: 'c1', inPoint: 0, outPoint: 10, duration: 10 });
    const track = createMockTrack({ clips: [clip] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:trim-clip', clipId: 'c1', inPoint: 2, outPoint: 8, duration: 6,
    }));
    expect(events[0].type).toBe('composition:clip-trimmed');
    expect(events[0].payload.inPoint).toBe(2);
    expect(events[0].payload.previousInPoint).toBe(0);
    expect(events[0].payload.duration).toBe(6);
  });
});

describe('composition:split-clip', () => {
  it('produces composition:clip-split event with left and right clips', () => {
    const clip = createMockClip({ id: 'c1', startTime: 10, duration: 10, inPoint: 0, outPoint: 10 });
    const track = createMockTrack({ clips: [clip] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:split-clip', clipId: 'c1', time: 15,
    }));
    expect(events[0].type).toBe('composition:clip-split');
    const payload = events[0].payload;
    const left = payload.leftClip as Clip;
    const right = payload.rightClip as Clip;
    // Left: startTime=10, duration=5, inPoint=0, outPoint=5
    expect(left.id).toBe('c1');
    expect(left.startTime).toBe(10);
    expect(left.duration).toBe(5);
    expect(left.inPoint).toBe(0);
    expect(left.outPoint).toBe(5);
    // Right: startTime=15, duration=5, inPoint=5, outPoint=10
    expect(right.startTime).toBe(15);
    expect(right.duration).toBe(5);
    expect(right.inPoint).toBe(5);
    expect(right.outPoint).toBe(10);
    expect(right.assetId).toBe(clip.assetId);
  });

  it('throws if time is not within clip range', () => {
    const clip = createMockClip({ id: 'c1', startTime: 10, duration: 10 });
    const track = createMockTrack({ clips: [clip] });
    const compState = stateWith(createMockComposition({ tracks: [track] }));
    // At exact start — invalid (nothing on left side)
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:split-clip', clipId: 'c1', time: 10,
    }))).toThrow();
    // At exact end — invalid
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:split-clip', clipId: 'c1', time: 20,
    }))).toThrow();
  });
});

describe('composition:reorder-tracks', () => {
  it('produces composition:tracks-reordered event', () => {
    const t1 = createMockTrack({ id: 't1' });
    const t2 = createMockTrack({ id: 't2' });
    const compState = stateWith(createMockComposition({ tracks: [t1, t2] }));
    const events = handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:reorder-tracks', trackIds: ['t2', 't1'],
    }));
    expect(events[0].type).toBe('composition:tracks-reordered');
    expect(events[0].payload.trackIds).toEqual(['t2', 't1']);
    expect(events[0].payload.previousTrackIds).toEqual(['t1', 't2']);
  });

  it('throws if trackIds count mismatch', () => {
    const t1 = createMockTrack({ id: 't1' });
    const compState = stateWith(createMockComposition({ tracks: [t1] }));
    expect(() => handleCompositionCommand(coreState, compState, makeEnvelope({
      type: 'composition:reorder-tracks', trackIds: ['t1', 't2'],
    }))).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/timeline && bun run test`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// packages/timeline/src/command-handler.ts
import type { PneumaCraftCoreState, CommandEnvelope, Event } from '@pneuma-craft/core';
import { generateId, CommandValidationError } from '@pneuma-craft/core';
import type { CompositionCommand, Composition, Track, Clip } from './types.js';
import type { CompositionState } from './state.js';
import { findClipById } from './composition-helpers.js';

function makeEvent(
  envelope: CommandEnvelope<CompositionCommand>,
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

function requireComposition(state: CompositionState): Composition {
  if (!state.composition) {
    throw new CommandValidationError('No composition exists');
  }
  return state.composition;
}

function requireTrack(composition: Composition, trackId: string): Track {
  const track = composition.tracks.find(t => t.id === trackId);
  if (!track) {
    throw new CommandValidationError(`Track not found: ${trackId}`);
  }
  return track;
}

function requireTrackNotLocked(track: Track): void {
  if (track.locked) {
    throw new CommandValidationError(`Track is locked: ${track.id}`);
  }
}

function requireClip(composition: Composition, clipId: string): { clip: Clip; track: Track } {
  const result = findClipById(composition, clipId);
  if (!result) {
    throw new CommandValidationError(`Clip not found: ${clipId}`);
  }
  return result;
}

export function handleCompositionCommand(
  coreState: PneumaCraftCoreState,
  compState: CompositionState,
  envelope: CommandEnvelope<CompositionCommand>,
): Event[] {
  const { command } = envelope;

  switch (command.type) {
    case 'composition:create': {
      if (compState.composition) {
        throw new CommandValidationError('Composition already exists');
      }
      const composition: Composition = {
        id: generateId(),
        settings: command.settings,
        tracks: [],
        transitions: [],
        duration: 0,
      };
      return [makeEvent(envelope, 'composition:created', { composition })];
    }

    case 'composition:add-track': {
      requireComposition(compState);
      const track: Track = { ...command.track, id: generateId() };
      return [makeEvent(envelope, 'composition:track-added', { track })];
    }

    case 'composition:remove-track': {
      const composition = requireComposition(compState);
      const track = requireTrack(composition, command.trackId);
      if (track.clips.length > 0) {
        throw new CommandValidationError(`Track has clips, remove them first: ${command.trackId}`);
      }
      return [makeEvent(envelope, 'composition:track-removed', { trackId: command.trackId, track })];
    }

    case 'composition:add-clip': {
      const composition = requireComposition(compState);
      const track = requireTrack(composition, command.trackId);
      requireTrackNotLocked(track);
      if (!coreState.registry.has(command.clip.assetId)) {
        throw new CommandValidationError(`Asset not found in registry: ${command.clip.assetId}`);
      }
      const clip: Clip = { ...command.clip, id: generateId(), trackId: command.trackId };
      return [makeEvent(envelope, 'composition:clip-added', { trackId: command.trackId, clip })];
    }

    case 'composition:remove-clip': {
      const composition = requireComposition(compState);
      const { clip, track } = requireClip(composition, command.clipId);
      requireTrackNotLocked(track);
      return [makeEvent(envelope, 'composition:clip-removed', {
        clipId: command.clipId, clip, trackId: track.id,
      })];
    }

    case 'composition:move-clip': {
      const composition = requireComposition(compState);
      const { clip, track: sourceTrack } = requireClip(composition, command.clipId);
      requireTrackNotLocked(sourceTrack);
      if (command.trackId && command.trackId !== sourceTrack.id) {
        const targetTrack = requireTrack(composition, command.trackId);
        requireTrackNotLocked(targetTrack);
      }
      return [makeEvent(envelope, 'composition:clip-moved', {
        clipId: command.clipId,
        startTime: command.startTime,
        trackId: command.trackId,
        previousStartTime: clip.startTime,
        previousTrackId: sourceTrack.id,
      })];
    }

    case 'composition:trim-clip': {
      const composition = requireComposition(compState);
      const { clip, track } = requireClip(composition, command.clipId);
      requireTrackNotLocked(track);
      return [makeEvent(envelope, 'composition:clip-trimmed', {
        clipId: command.clipId,
        inPoint: command.inPoint ?? clip.inPoint,
        outPoint: command.outPoint ?? clip.outPoint,
        duration: command.duration ?? clip.duration,
        previousInPoint: clip.inPoint,
        previousOutPoint: clip.outPoint,
        previousDuration: clip.duration,
      })];
    }

    case 'composition:split-clip': {
      const composition = requireComposition(compState);
      const { clip, track } = requireClip(composition, command.clipId);
      requireTrackNotLocked(track);
      const clipEnd = clip.startTime + clip.duration;
      if (command.time <= clip.startTime || command.time >= clipEnd) {
        throw new CommandValidationError(
          `Split time ${command.time} is not within clip range (${clip.startTime}, ${clipEnd})`,
        );
      }
      const splitOffset = command.time - clip.startTime;
      const leftClip: Clip = {
        ...clip,
        duration: splitOffset,
        outPoint: clip.inPoint + splitOffset,
      };
      const newClipId = generateId();
      const rightClip: Clip = {
        ...clip,
        id: newClipId,
        startTime: command.time,
        duration: clip.duration - splitOffset,
        inPoint: clip.inPoint + splitOffset,
      };
      return [makeEvent(envelope, 'composition:clip-split', {
        clipId: command.clipId,
        time: command.time,
        newClipId,
        leftClip,
        rightClip,
        originalClip: clip,
      })];
    }

    case 'composition:reorder-tracks': {
      const composition = requireComposition(compState);
      const currentIds = composition.tracks.map(t => t.id);
      if (command.trackIds.length !== currentIds.length) {
        throw new CommandValidationError('Track ID count mismatch');
      }
      const idSet = new Set(command.trackIds);
      if (idSet.size !== command.trackIds.length) {
        throw new CommandValidationError('Duplicate track IDs');
      }
      for (const id of command.trackIds) {
        if (!currentIds.includes(id)) {
          throw new CommandValidationError(`Unknown track ID: ${id}`);
        }
      }
      return [makeEvent(envelope, 'composition:tracks-reordered', {
        trackIds: command.trackIds,
        previousTrackIds: currentIds,
      })];
    }

    default:
      throw new CommandValidationError(`Unknown composition command: ${(command as CompositionCommand).type}`);
  }
}
```

- [ ] **Step 4: Create stub state.ts** (needed for CompositionState type import)

```typescript
// packages/timeline/src/state.ts (stub — full implementation in Task 6)
export interface CompositionState {
  readonly composition: import('./types.js').Composition | null;
}

export function createInitialCompositionState(): CompositionState {
  return { composition: null };
}
```

- [ ] **Step 5: Run tests**

Run: `cd packages/timeline && bun run test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/timeline/src/command-handler.ts packages/timeline/src/state.ts packages/timeline/__tests__/command-handler.test.ts
git commit -m "feat(timeline): composition command handler with 9 commands"
```

---

### Task 6: State Projection

**Files:**
- Modify: `packages/timeline/src/state.ts` (replace stub with full implementation)
- Create: `packages/timeline/__tests__/state.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/timeline/__tests__/state.test.ts
import { describe, it, expect } from 'vitest';
import { createInitialCompositionState, applyCompositionEvent } from '../src/state.js';
import type { Event } from '@pneuma-craft/core';
import { createMockComposition, createMockTrack, createMockClip, defaultSettings } from './helpers.js';

function makeEvent(type: string, payload: Record<string, unknown>): Event {
  return { id: 'e1', commandId: 'c1', actor: 'human', timestamp: 1000, type, payload };
}

describe('createInitialCompositionState', () => {
  it('starts with null composition', () => {
    const state = createInitialCompositionState();
    expect(state.composition).toBeNull();
  });
});

describe('applyCompositionEvent', () => {
  it('composition:created sets composition', () => {
    const comp = createMockComposition();
    const state = applyCompositionEvent(createInitialCompositionState(), makeEvent('composition:created', { composition: comp }));
    expect(state.composition).toEqual(comp);
  });

  it('composition:track-added adds track', () => {
    const track = createMockTrack({ id: 't1' });
    let state = { composition: createMockComposition() };
    state = applyCompositionEvent(state, makeEvent('composition:track-added', { track }));
    expect(state.composition!.tracks).toHaveLength(1);
    expect(state.composition!.tracks[0].id).toBe('t1');
  });

  it('composition:track-removed removes track', () => {
    const track = createMockTrack({ id: 't1' });
    let state = { composition: createMockComposition({ tracks: [track] }) };
    state = applyCompositionEvent(state, makeEvent('composition:track-removed', { trackId: 't1', track }));
    expect(state.composition!.tracks).toHaveLength(0);
  });

  it('composition:clip-added adds clip to track and sorts', () => {
    const existing = createMockClip({ id: 'c1', startTime: 10 });
    const track = createMockTrack({ id: 't1', clips: [existing] });
    const newClip = createMockClip({ id: 'c2', trackId: 't1', startTime: 5 });
    let state = { composition: createMockComposition({ tracks: [track] }) };
    state = applyCompositionEvent(state, makeEvent('composition:clip-added', { trackId: 't1', clip: newClip }));
    const clips = state.composition!.tracks[0].clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].id).toBe('c2'); // sorted: startTime 5 before 10
    expect(clips[1].id).toBe('c1');
  });

  it('composition:clip-removed removes clip and recomputes duration', () => {
    const clip = createMockClip({ id: 'c1', startTime: 0, duration: 10 });
    const track = createMockTrack({ clips: [clip] });
    let state = { composition: createMockComposition({ tracks: [track], duration: 10 }) };
    state = applyCompositionEvent(state, makeEvent('composition:clip-removed', { clipId: 'c1', clip, trackId: 'track-1' }));
    expect(state.composition!.tracks[0].clips).toHaveLength(0);
    expect(state.composition!.duration).toBe(0);
  });

  it('composition:clip-moved updates startTime and recomputes duration', () => {
    const clip = createMockClip({ id: 'c1', startTime: 0, duration: 5 });
    const track = createMockTrack({ clips: [clip] });
    let state = { composition: createMockComposition({ tracks: [track], duration: 5 }) };
    state = applyCompositionEvent(state, makeEvent('composition:clip-moved', {
      clipId: 'c1', startTime: 20, trackId: undefined, previousStartTime: 0, previousTrackId: 'track-1',
    }));
    expect(state.composition!.tracks[0].clips[0].startTime).toBe(20);
    expect(state.composition!.duration).toBe(25);
  });

  it('composition:clip-moved to different track', () => {
    const clip = createMockClip({ id: 'c1', trackId: 't1', startTime: 0, duration: 5 });
    const t1 = createMockTrack({ id: 't1', clips: [clip] });
    const t2 = createMockTrack({ id: 't2' });
    let state = { composition: createMockComposition({ tracks: [t1, t2] }) };
    state = applyCompositionEvent(state, makeEvent('composition:clip-moved', {
      clipId: 'c1', startTime: 10, trackId: 't2', previousStartTime: 0, previousTrackId: 't1',
    }));
    expect(state.composition!.tracks[0].clips).toHaveLength(0); // t1 empty
    expect(state.composition!.tracks[1].clips).toHaveLength(1); // t2 has clip
    expect(state.composition!.tracks[1].clips[0].trackId).toBe('t2');
  });

  it('composition:clip-trimmed updates clip trim points', () => {
    const clip = createMockClip({ id: 'c1', inPoint: 0, outPoint: 10, duration: 10 });
    const track = createMockTrack({ clips: [clip] });
    let state = { composition: createMockComposition({ tracks: [track] }) };
    state = applyCompositionEvent(state, makeEvent('composition:clip-trimmed', {
      clipId: 'c1', inPoint: 2, outPoint: 8, duration: 6,
      previousInPoint: 0, previousOutPoint: 10, previousDuration: 10,
    }));
    const updated = state.composition!.tracks[0].clips[0];
    expect(updated.inPoint).toBe(2);
    expect(updated.outPoint).toBe(8);
    expect(updated.duration).toBe(6);
  });

  it('composition:clip-split replaces clip with left and right', () => {
    const clip = createMockClip({ id: 'c1', startTime: 10, duration: 10, inPoint: 0, outPoint: 10 });
    const track = createMockTrack({ clips: [clip] });
    const leftClip = { ...clip, duration: 5, outPoint: 5 };
    const rightClip = { ...clip, id: 'c2', startTime: 15, duration: 5, inPoint: 5 };
    let state = { composition: createMockComposition({ tracks: [track] }) };
    state = applyCompositionEvent(state, makeEvent('composition:clip-split', {
      clipId: 'c1', time: 15, newClipId: 'c2', leftClip, rightClip, originalClip: clip,
    }));
    const clips = state.composition!.tracks[0].clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].id).toBe('c1');
    expect(clips[0].duration).toBe(5);
    expect(clips[1].id).toBe('c2');
    expect(clips[1].startTime).toBe(15);
  });

  it('composition:tracks-reordered reorders tracks', () => {
    const t1 = createMockTrack({ id: 't1' });
    const t2 = createMockTrack({ id: 't2' });
    let state = { composition: createMockComposition({ tracks: [t1, t2] }) };
    state = applyCompositionEvent(state, makeEvent('composition:tracks-reordered', {
      trackIds: ['t2', 't1'], previousTrackIds: ['t1', 't2'],
    }));
    expect(state.composition!.tracks[0].id).toBe('t2');
    expect(state.composition!.tracks[1].id).toBe('t1');
  });

  it('ignores unknown event types', () => {
    const state = createInitialCompositionState();
    const same = applyCompositionEvent(state, makeEvent('asset:registered', {}));
    expect(same).toBe(state);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/timeline && bun run test`
Expected: FAIL — `applyCompositionEvent` not implemented

- [ ] **Step 3: Write full state.ts implementation**

```typescript
// packages/timeline/src/state.ts
import type { Event } from '@pneuma-craft/core';
import type { Composition, Clip } from './types.js';
import { asCompositionEvent } from './events.js';
import {
  addClipToTrack,
  removeClipFromComposition,
  updateClipInComposition,
  recomputeDuration,
} from './composition-helpers.js';

export interface CompositionState {
  readonly composition: Composition | null;
}

export function createInitialCompositionState(): CompositionState {
  return { composition: null };
}

export function applyCompositionEvent(
  state: CompositionState,
  event: Event,
): CompositionState {
  // Ignore non-composition events
  if (!event.type.startsWith('composition:')) return state;

  const e = asCompositionEvent(event);

  switch (e.type) {
    case 'composition:created': {
      return { composition: e.payload.composition };
    }

    case 'composition:track-added': {
      const comp = state.composition!;
      return {
        composition: { ...comp, tracks: [...comp.tracks, e.payload.track] },
      };
    }

    case 'composition:track-removed': {
      const comp = state.composition!;
      return {
        composition: recomputeDuration({
          ...comp,
          tracks: comp.tracks.filter(t => t.id !== e.payload.trackId),
        }),
      };
    }

    case 'composition:clip-added': {
      const comp = state.composition!;
      return {
        composition: recomputeDuration(
          addClipToTrack(comp, e.payload.trackId, e.payload.clip),
        ),
      };
    }

    case 'composition:clip-removed': {
      const comp = state.composition!;
      return {
        composition: recomputeDuration(
          removeClipFromComposition(comp, e.payload.clipId),
        ),
      };
    }

    case 'composition:clip-moved': {
      const comp = state.composition!;
      const { clipId, startTime, trackId, previousTrackId } = e.payload;

      if (trackId && trackId !== previousTrackId) {
        // Cross-track move: remove from source, add to target with new startTime + trackId
        let updated = removeClipFromComposition(comp, clipId);
        const originalClip = comp.tracks
          .flatMap(t => t.clips)
          .find(c => c.id === clipId)!;
        const movedClip: Clip = { ...originalClip, startTime, trackId };
        updated = addClipToTrack(updated, trackId, movedClip);
        return { composition: recomputeDuration(updated) };
      }

      // Same-track move
      return {
        composition: recomputeDuration(
          updateClipInComposition(comp, clipId, clip => ({ ...clip, startTime })),
        ),
      };
    }

    case 'composition:clip-trimmed': {
      const comp = state.composition!;
      const { clipId, inPoint, outPoint, duration } = e.payload;
      return {
        composition: recomputeDuration(
          updateClipInComposition(comp, clipId, clip => ({
            ...clip, inPoint, outPoint, duration,
          })),
        ),
      };
    }

    case 'composition:clip-split': {
      const comp = state.composition!;
      const { clipId, leftClip, rightClip } = e.payload;
      // Replace original clip with left, add right
      let updated = updateClipInComposition(comp, clipId, () => leftClip);
      const trackId = leftClip.trackId;
      updated = addClipToTrack(updated, trackId, rightClip);
      return { composition: recomputeDuration(updated) };
    }

    case 'composition:tracks-reordered': {
      const comp = state.composition!;
      const trackMap = new Map(comp.tracks.map(t => [t.id, t]));
      const reordered = e.payload.trackIds.map(id => trackMap.get(id)!);
      return { composition: { ...comp, tracks: reordered } };
    }

    default:
      return state;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/timeline && bun run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/timeline/src/state.ts packages/timeline/__tests__/state.test.ts
git commit -m "feat(timeline): composition state projection (applyCompositionEvent)"
```

---

### Task 7: Undo (invertCompositionEvent)

**Files:**
- Create: `packages/timeline/src/undo.ts`
- Create: `packages/timeline/__tests__/undo.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/timeline/__tests__/undo.test.ts
import { describe, it, expect } from 'vitest';
import { invertCompositionEvent } from '../src/undo.js';
import type { Event } from '@pneuma-craft/core';
import { createMockComposition, createMockTrack, createMockClip, defaultSettings } from './helpers.js';

function makeEvent(type: string, payload: Record<string, unknown>): Event {
  return { id: 'e1', commandId: 'c1', actor: 'human', timestamp: 1000, type, payload };
}

describe('invertCompositionEvent', () => {
  it('composition:created → composition state reset (no inverse event — throws)', () => {
    // composition:create has no simple inverse in event form.
    // For MVP, we throw — undo of create is not supported.
    expect(() => invertCompositionEvent(
      makeEvent('composition:created', { composition: createMockComposition() }),
    )).toThrow();
  });

  it('composition:track-added → composition:track-removed', () => {
    const track = createMockTrack({ id: 't1' });
    const inv = invertCompositionEvent(makeEvent('composition:track-added', { track }));
    expect(inv.type).toBe('composition:track-removed');
    expect(inv.payload.trackId).toBe('t1');
    expect(inv.payload.track).toEqual(track);
  });

  it('composition:track-removed → composition:track-added', () => {
    const track = createMockTrack({ id: 't1' });
    const inv = invertCompositionEvent(makeEvent('composition:track-removed', { trackId: 't1', track }));
    expect(inv.type).toBe('composition:track-added');
    expect(inv.payload.track).toEqual(track);
  });

  it('composition:clip-added → composition:clip-removed', () => {
    const clip = createMockClip({ id: 'c1' });
    const inv = invertCompositionEvent(makeEvent('composition:clip-added', { trackId: 't1', clip }));
    expect(inv.type).toBe('composition:clip-removed');
    expect(inv.payload.clipId).toBe('c1');
    expect(inv.payload.clip).toEqual(clip);
    expect(inv.payload.trackId).toBe('t1');
  });

  it('composition:clip-removed → composition:clip-added', () => {
    const clip = createMockClip({ id: 'c1' });
    const inv = invertCompositionEvent(makeEvent('composition:clip-removed', { clipId: 'c1', clip, trackId: 't1' }));
    expect(inv.type).toBe('composition:clip-added');
    expect(inv.payload.trackId).toBe('t1');
    expect(inv.payload.clip).toEqual(clip);
  });

  it('composition:clip-moved → composition:clip-moved (reverse)', () => {
    const inv = invertCompositionEvent(makeEvent('composition:clip-moved', {
      clipId: 'c1', startTime: 20, trackId: 't2', previousStartTime: 5, previousTrackId: 't1',
    }));
    expect(inv.type).toBe('composition:clip-moved');
    expect(inv.payload.startTime).toBe(5);
    expect(inv.payload.trackId).toBe('t1');
    expect(inv.payload.previousStartTime).toBe(20);
    expect(inv.payload.previousTrackId).toBe('t2');
  });

  it('composition:clip-trimmed → composition:clip-trimmed (reverse)', () => {
    const inv = invertCompositionEvent(makeEvent('composition:clip-trimmed', {
      clipId: 'c1', inPoint: 2, outPoint: 8, duration: 6,
      previousInPoint: 0, previousOutPoint: 10, previousDuration: 10,
    }));
    expect(inv.type).toBe('composition:clip-trimmed');
    expect(inv.payload.inPoint).toBe(0);
    expect(inv.payload.outPoint).toBe(10);
    expect(inv.payload.duration).toBe(10);
    expect(inv.payload.previousInPoint).toBe(2);
  });

  it('composition:clip-split → restore original clip + remove right', () => {
    const original = createMockClip({ id: 'c1', startTime: 10, duration: 10 });
    const left = { ...original, duration: 5, outPoint: 5 };
    const right = { ...original, id: 'c2', startTime: 15, duration: 5, inPoint: 5 };
    const inv = invertCompositionEvent(makeEvent('composition:clip-split', {
      clipId: 'c1', time: 15, newClipId: 'c2', leftClip: left, rightClip: right, originalClip: original,
    }));
    // Inverse is a custom "composition:clip-unsplit" event
    expect(inv.type).toBe('composition:clip-unsplit');
    expect(inv.payload.clipId).toBe('c1');
    expect(inv.payload.newClipId).toBe('c2');
    expect(inv.payload.originalClip).toEqual(original);
  });

  it('composition:tracks-reordered → composition:tracks-reordered (reverse)', () => {
    const inv = invertCompositionEvent(makeEvent('composition:tracks-reordered', {
      trackIds: ['t2', 't1'], previousTrackIds: ['t1', 't2'],
    }));
    expect(inv.type).toBe('composition:tracks-reordered');
    expect(inv.payload.trackIds).toEqual(['t1', 't2']);
    expect(inv.payload.previousTrackIds).toEqual(['t2', 't1']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/timeline && bun run test`
Expected: FAIL

- [ ] **Step 3: Write implementation**

Note: `composition:clip-split` inversion produces a custom `composition:clip-unsplit` event. This needs to be handled in `applyCompositionEvent` too.

```typescript
// packages/timeline/src/undo.ts
import type { Event } from '@pneuma-craft/core';
import { generateId } from '@pneuma-craft/core';
import { asCompositionEvent } from './events.js';
import type { Track, Clip } from './types.js';

export function invertCompositionEvent(event: Event): Event {
  const e = asCompositionEvent(event);
  const base = {
    id: generateId(),
    commandId: event.commandId,
    actor: event.actor,
    timestamp: Date.now(),
  };

  switch (e.type) {
    case 'composition:created':
      throw new Error('Cannot invert composition:created — undo of create is not supported');

    case 'composition:track-added':
      return { ...base, type: 'composition:track-removed', payload: {
        trackId: e.payload.track.id, track: e.payload.track,
      }};

    case 'composition:track-removed':
      return { ...base, type: 'composition:track-added', payload: {
        track: e.payload.track,
      }};

    case 'composition:clip-added':
      return { ...base, type: 'composition:clip-removed', payload: {
        clipId: e.payload.clip.id, clip: e.payload.clip, trackId: e.payload.trackId,
      }};

    case 'composition:clip-removed':
      return { ...base, type: 'composition:clip-added', payload: {
        trackId: e.payload.trackId, clip: e.payload.clip,
      }};

    case 'composition:clip-moved':
      return { ...base, type: 'composition:clip-moved', payload: {
        clipId: e.payload.clipId,
        startTime: e.payload.previousStartTime,
        trackId: e.payload.previousTrackId,
        previousStartTime: e.payload.startTime,
        previousTrackId: e.payload.trackId ?? e.payload.previousTrackId,
      }};

    case 'composition:clip-trimmed':
      return { ...base, type: 'composition:clip-trimmed', payload: {
        clipId: e.payload.clipId,
        inPoint: e.payload.previousInPoint,
        outPoint: e.payload.previousOutPoint,
        duration: e.payload.previousDuration,
        previousInPoint: e.payload.inPoint,
        previousOutPoint: e.payload.outPoint,
        previousDuration: e.payload.duration,
      }};

    case 'composition:clip-split':
      return { ...base, type: 'composition:clip-unsplit', payload: {
        clipId: e.payload.clipId,
        newClipId: e.payload.newClipId,
        originalClip: e.payload.originalClip,
      }};

    case 'composition:tracks-reordered':
      return { ...base, type: 'composition:tracks-reordered', payload: {
        trackIds: e.payload.previousTrackIds,
        previousTrackIds: e.payload.trackIds,
      }};

    default:
      throw new Error(`Cannot invert unknown composition event: ${(e as Event).type}`);
  }
}
```

- [ ] **Step 4: Add `composition:clip-unsplit` handling to state.ts**

Add this case to the switch in `applyCompositionEvent`:

```typescript
    case 'composition:clip-unsplit' as string: {
      const comp = state.composition!;
      const { clipId, newClipId, originalClip } = event.payload as {
        clipId: string; newClipId: string; originalClip: Clip;
      };
      // Remove the right clip (newClipId), replace left clip with original
      let updated = removeClipFromComposition(comp, newClipId);
      updated = updateClipInComposition(updated, clipId, () => originalClip);
      return { composition: recomputeDuration(updated) };
    }
```

- [ ] **Step 5: Run tests**

Run: `cd packages/timeline && bun run test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/timeline/src/undo.ts packages/timeline/src/state.ts packages/timeline/__tests__/undo.test.ts
git commit -m "feat(timeline): invertCompositionEvent for undo support"
```

---

### Task 8: TimelineCore Facade

**Files:**
- Create: `packages/timeline/src/timeline-core.ts`
- Create: `packages/timeline/__tests__/timeline-core.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/timeline/__tests__/timeline-core.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTimelineCore } from '../src/timeline-core.js';
import type { Clip, Track } from '../src/types.js';
import type { Asset } from '@pneuma-craft/core';

describe('TimelineCore', () => {
  it('starts with empty core state and null composition', () => {
    const tl = createTimelineCore();
    expect(tl.getCoreState().registry.size).toBe(0);
    expect(tl.getComposition()).toBeNull();
  });

  it('dispatches core commands (asset:register)', () => {
    const tl = createTimelineCore();
    tl.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/t.mp4', name: 'T', metadata: {} },
    });
    expect(tl.getCoreState().registry.size).toBe(1);
  });

  it('dispatches composition commands', () => {
    const tl = createTimelineCore();
    tl.dispatch('human', {
      type: 'composition:create',
      settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
    });
    expect(tl.getComposition()).not.toBeNull();
    expect(tl.getComposition()!.settings.fps).toBe(30);
  });

  it('undo reverses composition commands', () => {
    const tl = createTimelineCore();
    tl.dispatch('human', {
      type: 'composition:create',
      settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
    });
    tl.dispatch('human', {
      type: 'composition:add-track',
      track: { type: 'video', name: 'V1', clips: [], muted: false, volume: 1, locked: false },
    });
    expect(tl.getComposition()!.tracks).toHaveLength(1);

    tl.undo();
    expect(tl.getComposition()!.tracks).toHaveLength(0);

    tl.redo();
    expect(tl.getComposition()!.tracks).toHaveLength(1);
  });

  it('undo reverses core commands', () => {
    const tl = createTimelineCore();
    tl.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/t.mp4', name: 'T', metadata: {} },
    });
    expect(tl.getCoreState().registry.size).toBe(1);
    tl.undo();
    expect(tl.getCoreState().registry.size).toBe(0);
  });

  it('subscribe notifies on all events', () => {
    const tl = createTimelineCore();
    const listener = vi.fn();
    tl.subscribe(listener);

    tl.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/t.mp4', name: 'T', metadata: {} },
    });
    tl.dispatch('human', {
      type: 'composition:create',
      settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
    });

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('cross-package validation: add-clip checks core registry', () => {
    const tl = createTimelineCore();
    tl.dispatch('human', {
      type: 'composition:create',
      settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
    });
    tl.dispatch('human', {
      type: 'composition:add-track',
      track: { type: 'video', name: 'V1', clips: [], muted: false, volume: 1, locked: false },
    });
    const trackId = tl.getComposition()!.tracks[0].id;

    // Should throw — asset not registered
    expect(() => tl.dispatch('human', {
      type: 'composition:add-clip', trackId,
      clip: { assetId: 'nonexistent', startTime: 0, duration: 5, inPoint: 0, outPoint: 5 },
    })).toThrow();

    // Register asset then add clip
    const [registered] = tl.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/t.mp4', name: 'T', metadata: {} },
    });
    const assetId = (registered.payload.asset as Asset).id;

    tl.dispatch('human', {
      type: 'composition:add-clip', trackId,
      clip: { assetId, startTime: 0, duration: 5, inPoint: 0, outPoint: 5 },
    });
    expect(tl.getComposition()!.tracks[0].clips).toHaveLength(1);
  });

  describe('full workflow: create → add tracks → add clips → split → undo', () => {
    it('works end-to-end', () => {
      const tl = createTimelineCore();

      // Register asset
      const [reg] = tl.dispatch('human', {
        type: 'asset:register',
        asset: { type: 'video', uri: '/clip.mp4', name: 'Clip', metadata: { duration: 30 } },
      });
      const assetId = (reg.payload.asset as Asset).id;

      // Create composition
      tl.dispatch('human', {
        type: 'composition:create',
        settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
      });

      // Add track
      tl.dispatch('human', {
        type: 'composition:add-track',
        track: { type: 'video', name: 'Main', clips: [], muted: false, volume: 1, locked: false },
      });
      const trackId = tl.getComposition()!.tracks[0].id;

      // Add clip
      tl.dispatch('human', {
        type: 'composition:add-clip', trackId,
        clip: { assetId, startTime: 0, duration: 10, inPoint: 0, outPoint: 10 },
      });
      expect(tl.getComposition()!.duration).toBe(10);

      // Split clip at t=5
      const clipId = tl.getComposition()!.tracks[0].clips[0].id;
      tl.dispatch('human', { type: 'composition:split-clip', clipId, time: 5 });
      expect(tl.getComposition()!.tracks[0].clips).toHaveLength(2);

      // Undo split
      tl.undo();
      expect(tl.getComposition()!.tracks[0].clips).toHaveLength(1);
      expect(tl.getComposition()!.tracks[0].clips[0].duration).toBe(10);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/timeline && bun run test`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// packages/timeline/src/timeline-core.ts
import type {
  PneumaCraftCoreState,
  CoreCommand,
  Actor,
  Event,
  CommandEnvelope,
} from '@pneuma-craft/core';
import {
  generateId,
  createEventStore,
  createInitialState,
  applyEvent,
  handleCommand,
  createUndoManager,
  invertCoreEvent,
} from '@pneuma-craft/core';
import type { Composition, CompositionCommand } from './types.js';
import { createInitialCompositionState, applyCompositionEvent } from './state.js';
import type { CompositionState } from './state.js';
import { handleCompositionCommand } from './command-handler.js';
import { invertCompositionEvent } from './undo.js';

export interface TimelineCore {
  getCoreState(): PneumaCraftCoreState;
  getComposition(): Composition | null;
  dispatch(actor: Actor, command: CoreCommand | CompositionCommand): Event[];
  subscribe(listener: (event: Event) => void): () => void;
  undo(): Event[] | null;
  redo(): Event[] | null;
  canUndo(): boolean;
  canRedo(): boolean;
  getEvents(): Event[];
}

function combinedInverter(event: Event): Event {
  if (event.type.startsWith('composition:')) {
    return invertCompositionEvent(event);
  }
  return invertCoreEvent(event);
}

function isCompositionCommand(
  command: CoreCommand | CompositionCommand,
): command is CompositionCommand {
  return command.type.startsWith('composition:');
}

export function createTimelineCore(): TimelineCore {
  const eventStore = createEventStore();
  const undoManager = createUndoManager(combinedInverter);
  let coreState = createInitialState();
  let compState: CompositionState = createInitialCompositionState();

  function appendEvents(events: Event[]): void {
    for (const event of events) {
      coreState = applyEvent(coreState, event);
      compState = applyCompositionEvent(compState, event);
      eventStore.append(event);
    }
  }

  return {
    getCoreState(): PneumaCraftCoreState {
      return coreState;
    },

    getComposition(): Composition | null {
      return compState.composition;
    },

    dispatch(actor: Actor, command: CoreCommand | CompositionCommand): Event[] {
      const envelope: CommandEnvelope = {
        id: generateId(),
        actor,
        timestamp: Date.now(),
        command: command as CoreCommand, // type widening for envelope
      };

      let events: Event[];
      if (isCompositionCommand(command)) {
        events = handleCompositionCommand(
          coreState,
          compState,
          envelope as CommandEnvelope<CompositionCommand>,
        );
      } else {
        events = handleCommand(coreState, envelope);
      }

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

- [ ] **Step 4: Run tests**

Run: `cd packages/timeline && bun run test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/timeline/src/timeline-core.ts packages/timeline/__tests__/timeline-core.test.ts
git commit -m "feat(timeline): TimelineCore facade composing core + composition"
```

---

### Task 9: Public Exports + Build Verification

**Files:**
- Modify: `packages/timeline/src/index.ts`

- [ ] **Step 1: Update index.ts**

```typescript
// packages/timeline/src/index.ts

// ── Types ───────────────────────────────────────────────────────────────
export type {
  CompositionSettings,
  TrackType,
  Track,
  Clip,
  Transition,
  Composition,
  PlaybackClock,
  ResolvedClip,
  ResolvedFrame,
  CompositionCommand,
} from './types.js';

// ── TimelineCore facade ─────────────────────────────────────────────────
export { createTimelineCore } from './timeline-core.js';
export type { TimelineCore } from './timeline-core.js';

// ── State ───────────────────────────────────────────────────────────────
export { createInitialCompositionState, applyCompositionEvent } from './state.js';
export type { CompositionState } from './state.js';

// ── Command handler ─────────────────────────────────────────────────────
export { handleCompositionCommand } from './command-handler.js';

// ── Typed events ────────────────────────────────────────────────────────
export { asCompositionEvent } from './events.js';
export type { CompositionEvent } from './events.js';

// ── Clip resolution ─────────────────────────────────────────────────────
export { resolveFrame } from './resolve-frame.js';

// ── Composition helpers ─────────────────────────────────────────────────
export {
  computeDuration,
  recomputeDuration,
  addClipToTrack,
  removeClipFromComposition,
  updateClipInComposition,
  findClipById,
  findTrackByClipId,
} from './composition-helpers.js';

// ── Undo ────────────────────────────────────────────────────────────────
export { invertCompositionEvent } from './undo.js';
```

- [ ] **Step 2: Run all tests**

Run: `cd packages/timeline && bun run test`
Expected: ALL PASS

- [ ] **Step 3: Run typecheck**

Run: `cd packages/timeline && bun run typecheck`
Expected: No errors

- [ ] **Step 4: Run build**

Run: `cd packages/timeline && bun run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/timeline/src/index.ts
git commit -m "feat(timeline): public exports — @pneuma-craft/timeline v0.1.0 complete"
```

---

### Task 10: Command Reference Documentation

**Files:**
- Create: `packages/timeline/docs/composition-commands.md`

- [ ] **Step 1: Write command reference**

```markdown
# Composition Commands Reference

## Overview

All composition commands flow through the event-sourced protocol:
`Command → handleCompositionCommand → Event(s) → applyCompositionEvent → State`

Commands are dispatched via `TimelineCore.dispatch(actor, command)` or
directly via `handleCompositionCommand(coreState, compState, envelope)`.

## Commands

### composition:create

Create a new composition with the given settings.

```typescript
dispatch('human', {
  type: 'composition:create',
  settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
});
```

**Validation:** No composition must exist yet.
**Event:** `composition:created`

---

### composition:add-track

Add a track to the composition.

```typescript
dispatch('human', {
  type: 'composition:add-track',
  track: { type: 'video', name: 'Main Video', clips: [], muted: false, volume: 1, locked: false },
});
```

**Validation:** Composition must exist.
**Event:** `composition:track-added` (track gets a generated `id`)

---

### composition:remove-track

Remove an empty track.

```typescript
dispatch('human', { type: 'composition:remove-track', trackId: 'track-abc' });
```

**Validation:** Track must exist and have no clips.
**Event:** `composition:track-removed`

---

### composition:add-clip

Add a clip to a track. The clip's `assetId` must reference an asset registered in core.

```typescript
dispatch('human', {
  type: 'composition:add-clip',
  trackId: 'track-abc',
  clip: { assetId: 'asset-123', startTime: 5, duration: 10, inPoint: 0, outPoint: 10 },
});
```

**Validation:** Track exists, not locked, assetId in core registry.
**Event:** `composition:clip-added` (clip gets generated `id` and `trackId`)

---

### composition:remove-clip

Remove a clip from the timeline.

```typescript
dispatch('human', { type: 'composition:remove-clip', clipId: 'clip-abc' });
```

**Validation:** Clip exists, track not locked.
**Event:** `composition:clip-removed`

---

### composition:move-clip

Move a clip to a new start time, optionally to a different track.

```typescript
dispatch('human', { type: 'composition:move-clip', clipId: 'clip-abc', startTime: 20 });
dispatch('human', { type: 'composition:move-clip', clipId: 'clip-abc', startTime: 20, trackId: 'track-xyz' });
```

**Validation:** Clip exists, source track not locked, target track (if specified) not locked.
**Event:** `composition:clip-moved`

---

### composition:trim-clip

Adjust clip's in/out points and duration.

```typescript
dispatch('human', {
  type: 'composition:trim-clip',
  clipId: 'clip-abc',
  inPoint: 2,
  outPoint: 8,
  duration: 6,
});
```

**Validation:** Clip exists, track not locked.
**Event:** `composition:clip-trimmed`

---

### composition:split-clip

Split a clip at a given time point into two clips.

```typescript
dispatch('human', { type: 'composition:split-clip', clipId: 'clip-abc', time: 15 });
```

**Validation:** Clip exists, track not locked, time is strictly between clip start and end.
**Event:** `composition:clip-split`

The left clip keeps the original ID. The right clip gets a new ID. Both reference the same asset.

---

### composition:reorder-tracks

Change the order of tracks.

```typescript
dispatch('human', { type: 'composition:reorder-tracks', trackIds: ['track-2', 'track-1', 'track-3'] });
```

**Validation:** All track IDs valid, no duplicates, same count.
**Event:** `composition:tracks-reordered`
```

- [ ] **Step 2: Commit**

```bash
git add packages/timeline/docs/composition-commands.md
git commit -m "docs(timeline): composition command reference"
```
