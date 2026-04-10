# @pneuma-craft/timeline

Composition model for pneuma-craft — tracks, clips, time-based arrangement, and frame resolution. Extends `@pneuma-craft/core` with timeline-specific commands and state.

## Key Concepts

### Composition

A `Composition` contains settings (width, height, fps), an ordered list of tracks, transitions between clips, and a computed duration. It represents the final arrangement of assets into a deliverable.

### Tracks and Clips

Tracks are typed containers (`video | audio | subtitle`) that hold clips. Each clip references an asset from the registry and has positioning data: `startTime`, `duration`, `inPoint`, `outPoint`. Audio clips support `volume`, `fadeIn`, and `fadeOut`.

### Frame Resolution

`resolveFrame(composition, time)` returns which clips are active at a given time, along with each clip's local playback position. This is the bridge between the timeline model and the video engine.

### Ripple Logic

Moving or removing clips automatically adjusts subsequent clips on the same track. Splitting a clip creates two clips that together span the original's time range.

## API Overview

### `createTimelineCore(): TimelineCore`

Extends the core facade with composition commands. Accepts both `CoreCommand` and `CompositionCommand`.

| Method | Description |
|--------|-------------|
| `dispatch(actor, command)` | Execute core or composition commands |
| `getCoreState()` | Asset registry, provenance, selection |
| `getComposition()` | Current composition or `null` |
| `subscribe(listener)` | Listen for all events |
| `undo()` / `redo()` | Undo/redo across both core and composition |
| `canUndo()` / `canRedo()` | Check availability |
| `getEvents()` | Full event log |

### Composition Commands

| Command | Payload |
|---------|---------|
| `composition:create` | `{ settings: CompositionSettings }` |
| `composition:add-track` | `{ track: Omit<Track, 'id'> }` |
| `composition:remove-track` | `{ trackId: string }` |
| `composition:add-clip` | `{ trackId: string, clip: Omit<Clip, 'id' \| 'trackId'> }` |
| `composition:remove-clip` | `{ clipId: string }` |
| `composition:move-clip` | `{ clipId: string, startTime: number, trackId?: string }` |
| `composition:trim-clip` | `{ clipId: string, inPoint?, outPoint?, duration? }` |
| `composition:split-clip` | `{ clipId: string, time: number }` |
| `composition:reorder-tracks` | `{ trackIds: string[] }` |

### Frame Resolution

```typescript
import { resolveFrame } from '@pneuma-craft/timeline';

const frame = resolveFrame(composition, 5.0);
// frame.time === 5.0
// frame.clips === [{ clip, track, localTime }]
```

### Helpers

| Function | Description |
|----------|-------------|
| `computeDuration(tracks)` | Calculate total duration from all clips |
| `recomputeDuration(composition)` | Return composition with updated duration |
| `addClipToTrack(composition, trackId, clip)` | Pure function to add a clip |
| `removeClipFromComposition(composition, clipId)` | Pure function to remove a clip |
| `findClipById(composition, clipId)` | Find a clip across all tracks |
| `findTrackByClipId(composition, clipId)` | Find which track contains a clip |

## Example

```typescript
import { createTimelineCore, resolveFrame } from '@pneuma-craft/timeline';

const tc = createTimelineCore();

// Register an asset first (core command)
const [registered] = tc.dispatch('human', {
  type: 'asset:register',
  asset: { type: 'video', uri: '/clip.mp4', name: 'Clip', metadata: { duration: 10 } },
});
const assetId = registered.payload.asset.id;

// Create a composition
tc.dispatch('human', {
  type: 'composition:create',
  settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
});

// Add a track and clip
tc.dispatch('human', {
  type: 'composition:add-track',
  track: { type: 'video', name: 'V1', clips: [], muted: false, volume: 1, locked: false },
});
const comp = tc.getComposition()!;
const trackId = comp.tracks[0].id;

tc.dispatch('human', {
  type: 'composition:add-clip',
  trackId,
  clip: { assetId, startTime: 0, duration: 10, inPoint: 0, outPoint: 10 },
});

// Split clip at 5 seconds
const clipId = tc.getComposition()!.tracks[0].clips[0].id;
tc.dispatch('human', { type: 'composition:split-clip', clipId, time: 5 });

// Resolve frame at t=3
const frame = resolveFrame(tc.getComposition()!, 3);
console.log(frame.clips.length); // 1 clip active
console.log(frame.clips[0].localTime); // 3.0

// Undo the split
tc.undo();
```

## Types Reference

| Type | Description |
|------|-------------|
| `Composition` | `{ id, settings, tracks, transitions, duration }` |
| `CompositionSettings` | `{ width, height, fps, aspectRatio, sampleRate? }` |
| `Track` | `{ id, type, name, clips, muted, volume, locked }` |
| `TrackType` | `'video' \| 'audio' \| 'subtitle'` |
| `Clip` | `{ id, assetId, trackId, startTime, duration, inPoint, outPoint, text?, volume?, fadeIn?, fadeOut? }` |
| `Transition` | `{ id, type, duration, fromClipId, toClipId }` |
| `PlaybackClock` | Interface for clock with play/pause/seek/rate control |
| `ResolvedClip` | `{ clip, track, localTime }` |
| `ResolvedFrame` | `{ time, clips: ResolvedClip[] }` |
| `TimelineCore` | Facade interface returned by `createTimelineCore()` |
| `CompositionCommand` | Union of all composition commands |
| `CompositionEvent` | Typed event union for composition changes |
