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
