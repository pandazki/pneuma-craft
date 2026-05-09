# Recipe: preview frames (planning-layer visuals)

**Applies to:** `@pneuma-craft/timeline` ≥ 0.4.0, `@pneuma-craft/video` ≥ 0.5.0

A `PreviewFrame` is a **planning-layer visual** attached to a track at a single time point. It points at one image asset and renders only when no real clip on the same track covers that moment. The moment a real clip lands, the preview lets go and disappears from the rendered output, but the preview-frame data itself stays in the composition (for revisit, audit, or undo).

Use preview frames when you want a cheap, scrubbable visual plan of the timeline before any real footage exists. The canonical workflow is **progressive fidelity**:

| Stage | Visual | Cost | Purpose |
|---|---|---|---|
| 1 | Line-art sketches scattered across the whole timeline | cheap | Define vibe; let the user feel pacing |
| 2 | Photoreal anchors at planned generation boundaries | medium | Lock keyframes before expensive runs |
| 3 | Real video clips replace the regions the user signed off on | expensive | Final cut |

Each stage is a review gate. Preview frames are stages 1 and 2; real `Clip`s are stage 3.

---

## What a preview frame is, exactly

```ts
interface PreviewFrame {
  readonly id: string;          // nanoid; stable across edits
  readonly trackId: string;
  readonly time: number;        // seconds; floats OK
  readonly assetId: string;     // MUST point at an asset of type 'image'
}
```

What it deliberately does **not** carry:

- ❌ `duration` — it is a step-function point; the visible interval is implicit
- ❌ `inPoint / outPoint`, `fadeIn / fadeOut`, `transition`, `volume`
- ❌ `fidelity: 'sketch' | 'anchor'` — fidelity belongs to the *asset* it references, not the placement

This makes preview frames orthogonal to `Clip`. Don't try to represent "draft footage" by adding optional fields to `Clip`; use a `PreviewFrame` for the placement and let the asset's own metadata carry the fidelity context.

---

## Constraints (enforced by the command handler)

| # | Rule | Behavior on violation |
|---|------|-----------------------|
| I1 | At most one preview frame per `(trackId, time)` | `add-preview-frame` rejects collision; use `rebind` or `move` to update |
| I2 | Track must have `type === 'video'` | rejected — audio / subtitle preview frames are out-of-scope for v1 |
| I3 | Asset must exist in the registry **and** have `type === 'image'` | rejected — video / audio assets are not allowed |
| I4 | `time >= 0` | rejected |
| I5 | `previewFrames[]` stays sorted ascending by `time` | maintained automatically by helpers |

`Track.locked === true` blocks all preview-frame edits, the same way it blocks clip edits.

---

## Quick start

```ts
import { createTimelineCore, buildSetPreviewFrameCommand } from '@pneuma-craft/timeline';
import type { Asset } from '@pneuma-craft/core';

const core = createTimelineCore();

// 1. Create a composition + a video track
core.dispatch('agent', {
  type: 'composition:create',
  settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9', sampleRate: 48000 },
});
core.dispatch('agent', {
  type: 'composition:add-track',
  track: {
    id: 'plan',
    type: 'video',
    name: 'Plan',
    clips: [],
    muted: false, volume: 1, locked: false, visible: true,
    // previewFrames is optional in the add-track input — defaults to []
  },
});

// 2. Register an image asset
const [registerEvent] = core.dispatch('agent', {
  type: 'asset:register',
  asset: {
    type: 'image',
    uri: '/sketches/scene-04.png',
    name: 'Scene 04 sketch',
    metadata: { width: 1920, height: 1080 },
  },
});
const sketchAssetId = (registerEvent.payload as { asset: Asset }).asset.id;

// 3. Place a preview at t=4s
core.dispatch('agent', {
  type: 'composition:add-preview-frame',
  trackId: 'plan',
  time: 4,
  assetId: sketchAssetId,
});
```

After this, scrubbing a `PlaybackEngine` to any time `T ∈ [4, ∞)` (until another preview or clip overrides) renders the sketch.

---

## Stage 1: agent fills the timeline with sketches

```ts
const trackId = 'plan';
const sketches = [
  { time: 0,  assetId: 'sketch-00' },
  { time: 2,  assetId: 'sketch-02' },
  { time: 4,  assetId: 'sketch-04' },
  { time: 6,  assetId: 'sketch-06' },
  { time: 8,  assetId: 'sketch-08' },
  { time: 10, assetId: 'sketch-10' },
  { time: 12, assetId: 'sketch-12' },
];

for (const s of sketches) {
  core.dispatch('agent', {
    type: 'composition:add-preview-frame',
    trackId,
    time: s.time,
    assetId: s.assetId,
  });
}

// composition.duration == 12 (max preview time)
// resolveFrame at T=5 → previewFrames[0].previewFrame.assetId === 'sketch-04'
//                       (greatest time ≤ T)
```

> **Tip — extending the visible tail.** A preview at `T == composition.duration` is at a zero-width point: the engine pauses at `time >= duration`, so the last preview won't visibly render during normal playback. If you want the last sketch to be on screen for some duration, add a sentinel preview / clip after it, or pre-set the composition's planned span.

---

## Stage 2: upgrade specific points (sketch → anchor)

When the agent decides which moments will be photoreal anchors, replace just those preview frames. Use the **`buildSetPreviewFrameCommand`** helper — it builds an `add-preview-frame` if the `(trackId, time)` slot is empty and a `rebind-preview-frame` if it's already taken, returning `null` if the slot already targets that asset (no-op).

```ts
import { buildSetPreviewFrameCommand } from '@pneuma-craft/timeline';

const upgrades = [
  { time: 4, assetId: 'anchor-04' },
  { time: 8, assetId: 'anchor-08' },
];

for (const u of upgrades) {
  const cmd = buildSetPreviewFrameCommand(core.getComposition()!, trackId, u.time, u.assetId);
  if (cmd) core.dispatch('agent', cmd);
}
```

The other six sketches stay as they are. The placement (`(trackId, time)`) is preserved across the upgrade — the same `PreviewFrame.id` keeps pointing at the same point on the timeline, the `assetId` is what changes. This makes the event log a clean audit trail of fidelity transitions:

```
preview-frame-added { id=pf-04, time=4, assetId=sketch-04 }   // stage 1
preview-frame-rebound { id=pf-04, assetId=anchor-04, previousAssetId=sketch-04 }  // stage 2
```

---

## Stage 3: real clip lands, preview lets go

```ts
// User approves 4–8s; agent runs seedance and registers the result.
const realClipAssetId = /* register the new video asset */;

core.dispatch('agent', {
  type: 'composition:add-clip',
  trackId,
  clip: {
    assetId: realClipAssetId,
    startTime: 4,
    duration: 4,
    inPoint: 0,
    outPoint: 4,
  },
});
```

After this:

- `resolveFrame(comp, 5)` → `clips: [real-clip], previewFrames: []` — clip wins
- `resolveFrame(comp, 3)` → preview at `t=2` still active (no clip covers t=3)
- `resolveFrame(comp, 8.5)` → preview-frame-08 (anchor) active again, since the clip ends at exactly `t=8`

The preview-frame data is **kept in `track.previewFrames`** even where a clip now covers it — useful for "show me what the original sketch was here" UI, or for restoring the plan if the user later removes the clip.

---

## Reading the resolved frame

`resolveFrame(composition, time)` already does the per-track let-go decision. Both arrays are populated only with what's renderable at `T`:

```ts
import { resolveFrame } from '@pneuma-craft/timeline';

const f = resolveFrame(comp, 5);
// f.clips         — ResolvedClip[]; clips active at T (any track type)
// f.previewFrames — ResolvedPreviewFrame[]; preview frames active at T
//                   (only populated for video tracks where no clip covers T)
```

`f.clips` and `f.previewFrames` are guaranteed to be **mutually exclusive per track** — you never have to re-derive "did this track let its preview go". Both arrays are in `composition.tracks` z-order.

---

## Wiring the engines

### PlaybackEngine — defaults to showing previews

```ts
import { createPlaybackEngine } from '@pneuma-craft/video';

const engine = createPlaybackEngine();
// equivalent to:
const engine = createPlaybackEngine({ includePreviewFrames: true });
```

Set `includePreviewFrames: false` only if you want a "pure clips" preview (rare — typically you always want planning visuals while editing).

### ExportEngine — defaults to skipping previews

```ts
import { createExportEngine } from '@pneuma-craft/video';

// Default — final cut. Regions without real clips render transparent / black.
const finalCutEngine = createExportEngine();

// Opt-in for review-grade "草样片" — preview frames are baked in.
const reviewExportEngine = createExportEngine({ includePreviewFrames: true });
```

The render rule (clip-wins-per-track) is identical between playback and export — only the "include preview layer" toggle differs. This keeps render authority unified.

---

## Edits and undo

The four commands mirror the existing clip command set; each emits a single past-tense event with `previous*` payload fields, and the undo manager already knows how to invert them.

| Command | Event | Notes |
|---|---|---|
| `add-preview-frame { trackId, time, assetId, id? }` | `preview-frame-added` | rejects on `(trackId, time)` collision (use `rebind`/`move` instead) |
| `remove-preview-frame { previewFrameId }` | `preview-frame-removed` | by id |
| `move-preview-frame { previewFrameId, time, trackId? }` | `preview-frame-moved` | atomic move; rejects collision at destination |
| `rebind-preview-frame { previewFrameId, assetId }` | `preview-frame-rebound` | only `assetId` changes; placement preserved |

`tl.undo()` and `tl.redo()` work as you'd expect:

```ts
core.dispatch('agent', {
  type: 'composition:add-preview-frame',
  trackId, time: 4, assetId: 'sketch-04',
});
core.undo();   // preview gone
core.redo();   // preview back
```

Cross-track moves are a single event so undo restores the original `(trackId, time)` atomically.

---

## Anti-patterns

**Don't** smuggle "draft footage" into `Clip` by adding optional fields. Clip carries `duration / inPoint / outPoint / fadeIn / fadeOut / volume` — these are finished-material concerns that don't apply to plans. Use `PreviewFrame`.

**Don't** put a `fidelity` field on `PreviewFrame`. The render decision and the data shape don't depend on whether the asset is a sketch or an anchor. Carry that on the asset itself (e.g., `metadata.fidelity` or via the provenance graph).

**Don't** rely on `ExportEngine` rendering preview frames by default. Final cuts skip them; review-grade "draft exports" must opt in.

**Don't** add preview frames to non-video tracks. The command handler rejects this (I2). Audio / subtitle preview support is out-of-scope for v1.

**Don't** assume `(trackId, time)` is the API key. The id is the primary key; events and undo reference `previewFrameId`. `(trackId, time)` is just a uniqueness invariant — convenient for upserts via `buildSetPreviewFrameCommand`, but not for direct addressing.

---

## Future work (deferred)

- **Explicit composition duration** — extending the visible tail past the last preview point will be controlled by `Composition.explicitDuration` once a real consumer needs it.
- **React UI rendering** — `@pneuma-craft/react` does not render preview-frame thumbnails on its `TimelineUI` yet. Consumers that need to show the planning layer in their custom track UI can subscribe to `track.previewFrames` directly.
- **Audio-side equivalent** — "draft" audio cues at points (e.g., narration sketches) are deferred. Open a request when you need them.
