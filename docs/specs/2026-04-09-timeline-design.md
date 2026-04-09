# @pneuma-craft/timeline Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Composition model, clip resolution, and event-sourced state for timeline operations
**Depends on:** @pneuma-craft/core

---

## 1. Purpose

`@pneuma-craft/timeline` provides the composition model for arranging assets into a final output. It models multi-track timelines with clips, handles time-based resolution, and extends core's event-sourced state protocol with composition-specific commands.

**What it does:**
- Composition data model (tracks, clips, transitions, settings)
- Command handler + event types + state projection for composition operations
- `resolveFrame()` — resolve active clips at any time point
- Immutable update helpers for composition transformations
- `PlaybackClock` interface (abstract — video package provides implementation)
- `TimelineCore` facade wrapping `CraftCore` + composition state

**What it does not do:**
- Render video or audio (that's `@pneuma-craft/video`)
- Provide UI components (that's `@pneuma-craft/react`)
- Manage its own EventStore or undo/redo (delegates to core)

---

## 2. Architecture

### Integration with Core

Timeline uses a **composable** architecture — it exports its own handler, projection, and invert functions. Core does not know about timeline. The `TimelineCore` facade composes them:

```
Consumer
  └── TimelineCore (facade)
        ├── CraftCore (handles asset/provenance/selection commands)
        │     ├── EventStore (shared — single event stream)
        │     └── UndoManager (shared — handles all undo/redo)
        └── CompositionState (handles composition commands)
              ├── handleCompositionCommand()
              ├── applyCompositionEvent()
              └── invertCompositionEvent()
```

**Event flow:**
```
dispatch(actor, command)
  → is CompositionCommand?
    → yes: handleCompositionCommand(coreState, compState, envelope) → events
    → no:  core.handleCommand(coreState, envelope) → events
  → undoManager.record(envelope.id, events)
  → for each event:
      → applyCompositionEvent(compState, event) OR applyEvent(coreState, event)
      → eventStore.append(event)
```

**Cross-package validation:** `composition:add-clip` needs to verify the `assetId` exists in core's registry. The `handleCompositionCommand` function receives both `PneumaCraftCoreState` and `CompositionState` to enable this.

### State Model

```typescript
interface CompositionState {
  readonly composition: Composition | null;
}
```

`composition` is `null` until `composition:create` is dispatched. All other composition commands require a non-null composition.

---

## 3. Data Model

Types are already scaffolded in `packages/timeline/src/types.ts`. Key design decisions:

### Same-Track Non-Overlap Invariant

**Clips on the same track must never overlap in time.** This is enforced at the command handler level:

- `add-clip`: after inserting, any subsequent clips on the same track that overlap are **rippled** (pushed forward in time) to make room.
- `move-clip`: after moving, overlapping clips on the target track are rippled.
- `split-clip`: produces two adjacent non-overlapping clips by definition.
- `trim-clip`: may create a gap but never causes overlap.

**Multi-track overlap is allowed** — that's the whole point of having multiple tracks. If you need two video clips playing simultaneously, put them on separate tracks. The compositor layers them by track order.

This applies to all track types equally: video, audio, and subtitle.

### Ripple Behavior

When a clip is inserted or moved and would overlap with subsequent clips on the same track, those clips are pushed forward by the overlap amount. This produces additional `composition:clip-moved` events in the same command.

```
Before:  |--[==A==]--[==B==]--[==C==]--|
Insert X at A's position:
After:   |--[==X==][==A==]--[==B==]--[==C==]--|
                   ^ A, B, C all shifted right by X.duration
```

Ripple only affects clips that **start at or after** the insertion point. Clips before the insertion point are untouched.

### Clip Ordering

Clips within a track are always sorted by `startTime` (ascending). Every operation that adds or moves a clip re-sorts the clips array. This is borrowed from OpenReel Video's pattern — it guarantees stable iteration order for `resolveFrame` and sequential playback.

### Duration as Computed Property

`Composition.duration` is recomputed after every event via `computeDuration()`:

```typescript
function computeDuration(composition: Composition): number {
  let max = 0;
  for (const track of composition.tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > max) max = end;
    }
  }
  return max;
}
```

This is done inside `applyCompositionEvent` — no separate command needed.

### Clip Time Model

```
Timeline:  |----[====CLIP====]----|
           0   startTime        startTime + duration

Source:    |--[========FULL ASSET========]--|
              inPoint      outPoint

localTime = inPoint + (time - startTime)
```

- `startTime`: position on the timeline (seconds)
- `duration`: visible duration on timeline (seconds)
- `inPoint`: trim start within source asset (seconds)
- `outPoint`: trim end within source asset (seconds)
- Invariant: `outPoint - inPoint == duration`

---

## 4. Commands and Events

### 4.1 Command → Event Mapping

| Command | Event | Key Payload |
|---------|-------|-------------|
| `composition:create` | `composition:created` | `{ composition }` (full initial object) |
| `composition:add-track` | `composition:track-added` | `{ track }` (with generated id) |
| `composition:remove-track` | `composition:track-removed` | `{ trackId, track }` (full track for undo) |
| `composition:add-clip` | `composition:clip-added` + `composition:clip-moved`* | `{ trackId, clip }` + ripple moves |
| `composition:remove-clip` | `composition:clip-removed` | `{ clipId, clip, trackId }` (full clip for undo) |
| `composition:move-clip` | `composition:clip-moved` + `composition:clip-moved`* | `{ clipId, startTime, ... }` + ripple moves |
| `composition:trim-clip` | `composition:clip-trimmed` | `{ clipId, inPoint, outPoint, duration, previousInPoint, previousOutPoint, previousDuration }` |
| `composition:split-clip` | `composition:clip-split` | `{ clipId, time, newClipId, leftClip, rightClip }` |
| `composition:reorder-tracks` | `composition:tracks-reordered` | `{ trackIds, previousTrackIds }` |

### 4.2 Validation Rules

**All clip operations** check that the containing track is not locked (`track.locked === false`).

| Command | Validation |
|---------|-----------|
| `composition:create` | No composition exists yet |
| `composition:add-track` | Composition exists |
| `composition:remove-track` | Track exists, track has no clips |
| `composition:add-clip` | Track exists, track not locked, assetId exists in core registry. Ripples overlapping clips on same track. |
| `composition:remove-clip` | Clip exists, track not locked |
| `composition:move-clip` | Clip exists, source track not locked, target track (if specified) exists and not locked. Ripples overlapping clips on target track. |
| `composition:trim-clip` | Clip exists, track not locked |
| `composition:split-clip` | Clip exists, track not locked, time is within clip range `(startTime, startTime + duration)` |
| `composition:reorder-tracks` | All trackIds are valid, no duplicates, same count as current tracks |

### 4.3 split-clip Semantics

Split a clip at time `t` into two clips:

```
Before:  |---[====== CLIP A (id: c1) ======]---|
                       ^ t

After:   |---[== LEFT (id: c1) ==][== RIGHT (id: new) ==]---|
```

- **Left clip** keeps the original ID (`c1`)
- **Right clip** gets a new generated ID
- Both reference the same `assetId`
- Left: `startTime` unchanged, `duration = t - startTime`, `outPoint = inPoint + (t - startTime)`
- Right: `startTime = t`, `duration = originalDuration - (t - startTime)`, `inPoint = originalInPoint + (t - startTime)`, `outPoint` unchanged

### 4.4 Typed Events

Following core's `CoreEvent` pattern, timeline defines a `CompositionEvent` discriminated union for type-safe payload access:

```typescript
type CompositionEvent =
  | CompositionCreatedEvent
  | CompositionTrackAddedEvent
  | CompositionTrackRemovedEvent
  | CompositionClipAddedEvent
  | CompositionClipRemovedEvent
  | CompositionClipMovedEvent
  | CompositionClipTrimmedEvent
  | CompositionClipSplitEvent
  | CompositionTracksReorderedEvent;
```

With `asCompositionEvent()` helper, matching core's `asCoreEvent()`.

---

## 5. resolveFrame

The most important pure function in the package. Given a composition and a time, returns all active clips across all tracks.

```typescript
function resolveFrame(composition: Composition, time: number): ResolvedFrame
```

**Algorithm:**
1. For each track (in order, skip muted tracks):
2. For each clip in track, check half-open interval: `time >= clip.startTime && time < clip.startTime + clip.duration`
3. If active, compute `localTime = clip.inPoint + (time - clip.startTime)`
4. Collect into `ResolvedFrame.clips` (ordered by track — bottom tracks first, top tracks last)

**Why half-open interval:** At clip boundaries, `[start, end)` means each time point belongs to exactly one clip. No double-rendering at cut points.

**Muted tracks:** For MVP, **exclude muted tracks** from `resolveFrame` — the video engine doesn't need to decode frames for muted tracks. Audio muting is handled separately by the audio scheduler.

### Scope boundary: resolveFrame is pure data

`resolveFrame` is a **pure function** — data in, data out. It does not decode, render, or touch files. It only answers: "at this time, which clips are active and what's their local source time?"

The downstream consumption by `@pneuma-craft/video` looks like this:

```
resolveFrame(composition, currentTime)
  → ResolvedFrame { clips: [{ clip, track, localTime }] }
     │
     └─ Video PlaybackEngine (in @pneuma-craft/video):
          ├─ For each video/image clip:
          │    MediaBunny Input → CanvasSink.getCanvas(localTime)
          │    → decodes one frame from the source asset
          │
          ├─ Compositor (Canvas 2D):
          │    layers decoded frames by track order → preview canvas
          │
          └─ AudioScheduler (Web Audio API):
               schedules AudioBufferSourceNodes for audio clips
```

This separation is intentional:
- **timeline** owns "what should play" (editing model, serializable, undo-able)
- **video** owns "how to display it" (runtime rendering, transient state)
- The connection point is `resolveFrame` — timeline exports it, video calls it every frame

---

## 6. Immutable Update Helpers

Internal helpers used by `applyCompositionEvent`. Also exported for direct use.

```typescript
// Find and update a clip anywhere in the composition
updateClipInComposition(composition, clipId, updater: (clip: Clip) => Clip): Composition

// Add clip to track, auto-sort by startTime
addClipToTrack(composition, trackId, clip): Composition

// Remove clip from composition (finds it across all tracks)
removeClipFromComposition(composition, clipId): Composition

// Recompute duration from all clips
recomputeDuration(composition): Composition
```

---

## 7. TimelineCore Facade

```typescript
interface TimelineCore {
  // Core state
  getCoreState(): PneumaCraftCoreState;
  getComposition(): Composition | null;

  // Unified dispatch — handles both CoreCommand and CompositionCommand
  dispatch(actor: Actor, command: CoreCommand | CompositionCommand): Event[];

  // Delegated from CraftCore
  subscribe(listener: (event: Event) => void): () => void;
  undo(): Event[] | null;
  redo(): Event[] | null;
  canUndo(): boolean;
  canRedo(): boolean;
  getEvents(): Event[];
}

function createTimelineCore(): TimelineCore;
```

`TimelineCore` creates a `CraftCore` internally and manages `CompositionState` alongside it. Both share the same `EventStore` and `UndoManager`.

---

## 8. PlaybackClock

An abstract interface — already defined in `types.ts`. Timeline only exports the interface. The `@pneuma-craft/video` package provides the concrete implementation using `AudioContext.currentTime`.

No implementation in this package. Just re-export the interface.

---

## 9. Types Update

The existing `types.ts` needs one addition — `split-clip` command:

```typescript
// Add to CompositionCommand union:
| { type: 'composition:split-clip'; clipId: string; time: number }
```

---

## 10. File Structure

```
packages/timeline/
├── src/
│   ├── types.ts                  # (existing) Composition types — add split-clip command
│   ├── events.ts                 # CompositionEvent discriminated union
│   ├── composition-helpers.ts    # Immutable update helpers + computeDuration
│   ├── resolve-frame.ts          # resolveFrame function
│   ├── command-handler.ts        # handleCompositionCommand
│   ├── state.ts                  # createInitialCompositionState, applyCompositionEvent
│   ├── undo.ts                   # invertCompositionEvent
│   ├── timeline-core.ts          # TimelineCore facade
│   └── index.ts                  # Public exports
├── __tests__/
│   ├── composition-helpers.test.ts
│   ├── resolve-frame.test.ts
│   ├── command-handler.test.ts
│   ├── state.test.ts
│   ├── undo.test.ts
│   └── timeline-core.test.ts
├── docs/
│   └── composition-commands.md   # Command reference with examples
└── package.json
```

---

## 11. Testing Strategy

Borrowing from OpenReel's test patterns:

- **Mock factories:** `createMockComposition()`, `createMockTrack()`, `createMockClip()` — consistent test fixtures
- **resolveFrame tests:** Cover boundary conditions (exact start, just before end, between clips, muted tracks, empty tracks)
- **Command handler tests:** Both success and error paths for each command, locked track rejection
- **Split-clip tests:** Verify left/right clip timing math (inPoint, outPoint, duration invariants)
- **End-to-end:** Create composition → add tracks → add clips → move/trim/split → undo → verify state

---

## 12. MVP Scope

**In scope:**
- All 9 commands with validation
- State projection with typed events
- resolveFrame (half-open interval)
- Immutable helpers (sort, duration recompute)
- Same-track non-overlap invariant with ripple on insert/move
- Undo via invertCompositionEvent
- TimelineCore facade
- Command reference doc

**Out of scope (future):**
- Transition rendering (structure exists in types, no processing)
- Snap-to-grid
- Keyframes / animation
- Track type enforcement (e.g., no video clip on audio track)
- Ripple delete / ripple trim (removing a clip and closing the gap)
