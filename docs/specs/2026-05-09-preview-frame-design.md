# Preview Frame Design Spec

**Date:** 2026-05-09
**Status:** Approved
**Scope:** Add a "preview frame" first-class concept to `@pneuma-craft/timeline` + render integration in `@pneuma-craft/video`

---

## 1. Motivation

Downstream consumers (notably ClipCraft, the AIGC video mode in pneuma-skills) follow a three-stage progressive-fidelity workflow:

1. Agent fills the entire timeline with cheap line-art **sketches** (vibe-only, "假片")
2. Agent upgrades sketches at planned generation boundaries to photorealistic **anchors** (gpt-image-2, "半真")
3. Agent runs expensive seedance generation; the resulting **real video clips** land on the track

Each stage is a review gate. Each stage is more expensive than the previous. The user must be able to scrub the timeline and feel the rhythm of the planned cut **before** any expensive real render runs.

This requires a new kind of timeline content: a **planning-layer visual** attached at a time point, that lets go (does not render) when a real clip eventually covers that moment.

### Why upstream into pneuma-craft (not solved inside ClipCraft)

1. **Render authority is unified.** `frame-renderer.ts → resolveFrame()` is the single decision point that both `playback-engine` and `export-engine` consult. A let-go rule that lives in ClipCraft's viewer would diverge from export, producing two render rules.
2. **Cross-mode reusability.** "Cheap agent draft → human approval → real expensive artifact" is a general pattern, not video-specific. Other future modes can reuse the same data + render plumbing.
3. **Avoid polluting `Clip`.** `Clip` already carries `duration / inPoint / outPoint / fadeIn / fadeOut / volume`. Forcing "this is just a placeholder" into `Clip` would dilute the "finished material" semantics and turn the existing trim/split invariants into permanent optionals.

---

## 2. Domain Concept

A **PreviewFrame** is a planning-layer visual attached to a single time point on a single track. It points at one image asset and exists only to let users scrub a planned visual rhythm before real clips land.

```typescript
interface PreviewFrame {
  readonly id: string;          // nanoid; stable identity for events/undo
  readonly trackId: string;
  readonly time: number;        // seconds, float
  readonly assetId: string;     // MUST point at an asset of type 'image'
}
```

### Explicitly excluded fields

- ❌ `duration` — preview frames are points; the visible interval is implicit (until the next preview, the next clip, or end of composition)
- ❌ `inPoint / outPoint` — no material-level trimming
- ❌ `transition / fadeIn / fadeOut` — no transitions
- ❌ `volume / muted` — no audio participation
- ❌ `fidelity: 'sketch' | 'anchor'` — fidelity is a property of the referenced asset, not of the preview-frame placement

---

## 3. Data Model

### 3.1 `Track` extension

```typescript
interface Track {
  readonly id: string;
  readonly type: TrackType;             // 'video' | 'audio' | 'subtitle'
  readonly name: string;
  readonly clips: Clip[];
  readonly previewFrames: PreviewFrame[];   // NEW; sorted ascending by time
  readonly muted: boolean;
  readonly volume: number;
  readonly locked: boolean;
  readonly visible: boolean;
}
```

### 3.2 Invariants

| # | Rule | Enforced where |
|---|------|----------------|
| **I1** | `(trackId, time)` is unique within a track | command-handler |
| **I2** | Only `track.type === 'video'` may host preview frames (v1) | command-handler |
| **I3** | Referenced asset exists in registry **and** has `type === 'image'` | command-handler |
| **I4** | `time >= 0` | command-handler |
| **I5** | `previewFrames` array is ascending by `time` | composition-helpers (insertion maintains) |

`id` is the primary key; `(trackId, time)` is the natural key (used for upsert ergonomics, see §6).

### 3.3 `Composition` does **not** change shape

No top-level `previewLayer` or similar. Preview frames belong to their track. Cross-track z-stacking continues to follow `composition.tracks` array order.

---

## 4. Resolve Rule

At time `T`, each track contributes at most one kind of layer to the rendered frame:

```
if track.visible === false              → track contributes nothing (existing rule)
elif a clip in track covers T            → track contributes the clip(s)
elif track.type === 'video' AND ∃ preview frame in track at time ≤ T  → track contributes the preview frame with the GREATEST time ≤ T
else                                     → track contributes nothing
```

**Per-track let-go.** Only the track that has its own clip lets its own preview go. Track A's clip does not suppress track B's preview.

**Boundary cases:**
- `T === clip.startTime` → clip wins (existing half-open interval `[start, end)`)
- `T === previewFrame.time` → that preview wins (the resolve search uses `≤`, not `<`)
- `T < first preview frame.time` AND no clip → nothing renders
- `T ≥ last preview frame.time` AND no clip → last preview frame wins (extends to composition end)

### `ResolvedFrame` shape

```typescript
interface ResolvedPreviewFrame {
  readonly previewFrame: PreviewFrame;
  readonly track: Track;
}

interface ResolvedFrame {
  readonly time: number;
  readonly clips: ResolvedClip[];                  // unchanged
  readonly previewFrames: ResolvedPreviewFrame[];  // NEW; populated only for tracks where clips array contributed nothing
}
```

The two arrays are **mutually exclusive per track** — `resolveFrame` has already done the let-go decision so consumers do not re-derive it.

### Algorithmic note

Per-track preview frame lookup uses binary search over the (sorted, I5) `previewFrames` array — `O(log n)` per track. Clip search remains the existing linear scan.

---

## 5. Composition Duration

```typescript
function recomputeDuration(comp: Composition): Composition {
  let max = 0;
  for (const track of comp.tracks) {
    for (const clip of track.clips) max = Math.max(max, clip.startTime + clip.duration);
    for (const pf of track.previewFrames) max = Math.max(max, pf.time);
  }
  return { ...comp, duration: max };
}
```

### Known boundary: zero-width tail

A preview at exactly `time === composition.duration` is not visible during normal playback (the engine pauses at `time >= duration`). v1 accepts this; the agent will normally place either another preview or a clip after the last planning point, or the consumer will set composition duration via a future `explicitDuration` field. Out-of-scope for v1.

---

## 6. Commands

Four new commands, mirroring the existing `clip-add / -remove / -move / -rebind` pattern:

```typescript
type PreviewFrameCommand =
  | {
      type: 'composition:add-preview-frame';
      trackId: string;
      time: number;
      assetId: string;
      id?: string;                    // optional override; auto-generated otherwise
    }
  | {
      type: 'composition:remove-preview-frame';
      previewFrameId: string;
    }
  | {
      type: 'composition:move-preview-frame';
      previewFrameId: string;
      time: number;
      trackId?: string;               // omitted = same track, only time changes
    }
  | {
      type: 'composition:rebind-preview-frame';
      previewFrameId: string;
      assetId: string;
    };
```

These merge into the existing `CompositionCommand` union.

### Command-handler validation

| Command | Checks |
|---------|--------|
| `add-preview-frame` | composition exists; track exists and `type === 'video'` (I2); track unlocked; `time >= 0` (I4); no existing preview at `(trackId, time)` (I1); asset exists in registry and `type === 'image'` (I3); `id` (if provided) globally unique |
| `remove-preview-frame` | preview frame exists; its track unlocked |
| `move-preview-frame` | preview frame exists; source + target tracks unlocked; new `time >= 0`; no existing preview at the new `(trackId, time)` |
| `rebind-preview-frame` | preview frame exists; track unlocked; new asset exists in registry and `type === 'image'` |

Two new helper functions: `requirePreviewFrame(composition, id)` and `requireImageAsset(coreState, assetId)`. The latter is stricter than the existing clip-side `coreState.registry.has` check (it inspects asset type).

### Agent ergonomic helper (utility, not a command)

For the common "set the preview at this point to this asset, regardless of whether one already exists":

```typescript
export function buildSetPreviewFrameCommand(
  composition: Composition,
  trackId: string,
  time: number,
  assetId: string,
): CompositionCommand | null;
//   ↑ null when the preview already exists at (trackId, time) with this assetId (no-op)
```

Returns either an `add-preview-frame` or a `rebind-preview-frame` command, ready to dispatch. The 1:1 command/event protocol stays clean; upsert lives in user-space.

---

## 7. Events

Four new events, 1:1 with commands. Payloads carry "previous" values where needed for undo.

```typescript
type PreviewFrameEvent =
  | {
      type: 'composition:preview-frame-added';
      payload: { previewFrame: PreviewFrame };
    }
  | {
      type: 'composition:preview-frame-removed';
      payload: {
        previewFrameId: string;
        previewFrame: PreviewFrame;          // full pf preserved for undo
        trackId: string;
      };
    }
  | {
      type: 'composition:preview-frame-moved';
      payload: {
        previewFrameId: string;
        time: number;
        trackId: string | undefined;
        previousTime: number;
        previousTrackId: string;
      };
    }
  | {
      type: 'composition:preview-frame-rebound';
      payload: {
        previewFrameId: string;
        assetId: string;
        previousAssetId: string;
      };
    };
```

### State application

Each `applyCompositionEvent` case follows the existing pattern: pure `Composition` update, then `recomputeDuration`. Insertion maintains I5 (sorted by `time`).

### Undo

Compensating-event mapping in `undo.ts`:

| Forward event | Compensating event |
|---------------|--------------------|
| `preview-frame-added` | `preview-frame-removed` (using saved `previewFrame`) |
| `preview-frame-removed` | `preview-frame-added` (using saved `previewFrame`) |
| `preview-frame-moved` | `preview-frame-moved` (with `time/trackId` swapped to `previous*`) |
| `preview-frame-rebound` | `preview-frame-rebound` (with `assetId` swapped to `previousAssetId`) |

No new mechanism — just four new mappings.

---

## 8. Renderer Integration

### 8.1 `createFrameRenderer` signature change (pre-1.0 internal)

The fifth positional parameter changes from `subtitleRenderer?: SubtitleRenderer` to an options object:

```typescript
interface CreateFrameRendererOptions {
  readonly subtitleRenderer?: SubtitleRenderer;
  readonly includePreviewFrames?: boolean;   // default false
}

function createFrameRenderer(
  decoder: MediaDecoder,
  compositor: Compositor,
  width: number,
  height: number,
  options?: CreateFrameRendererOptions,
): FrameRenderer;
```

### 8.2 `renderFrame` algorithm

The video-layer loop iterates `composition.tracks` in array order (z-order) and decides per-track:

```typescript
const resolved = resolveFrame(composition, time);
const clipsByTrack = groupBy(resolved.clips, rc => rc.track.id);
const previewByTrack = new Map(resolved.previewFrames.map(rpf => [rpf.track.id, rpf]));

const layers: CompositeLayer[] = [];
let zIndex = 0;

for (const track of composition.tracks) {
  if (track.type !== 'video') continue;

  const trackClips = clipsByTrack.get(track.id);
  if (trackClips?.length) {
    for (const rc of trackClips) {
      const source = await decoder.decodeVideoFrame(rc.clip.assetId, rc.localTime, width, height);
      layers.push({ source, opacity: 1, zIndex: zIndex++ });
    }
    continue;   // clip wins; do not consider preview on this track
  }

  if (includePreviewFrames) {
    const rpf = previewByTrack.get(track.id);
    if (rpf) {
      const source = await decoder.decodeVideoFrame(rpf.previewFrame.assetId, 0, width, height);
      //                                                                       ^ images: time arg ignored
      layers.push({ source, opacity: 1, zIndex: zIndex++ });
    }
  }
}

// existing subtitle path unchanged
```

The `for-of` over `composition.tracks` (rather than over `resolved.clips`) preserves correct z-order when one track contributes a clip and a track above it contributes a preview.

### 8.3 Decoder reuse

Image assets flow through the existing `decodeVideoFrame` image fast path: cached `ImageBitmap`, `fit: 'contain'`, alpha preserved. No decoder changes.

### 8.4 Engine wiring

**`PlaybackEngine`:**
```typescript
interface PlaybackEngineOptions {
  // ... existing fields
  includePreviewFrames?: boolean;     // default true
}
```
PlaybackEngine constructs its FrameRenderer with `includePreviewFrames: options?.includePreviewFrames ?? true`.

**`ExportEngine`:**
```typescript
interface ExportEngineOptions {
  // ... existing fields
  includePreviewFrames?: boolean;     // default false
}
```
ExportEngine constructs its FrameRenderer with `includePreviewFrames: options?.includePreviewFrames ?? false`. Documented as "opt-in for review-grade exports of unfinished timelines."

### 8.5 Unaffected paths

Audio scheduler, master clock, offline audio renderer, GPU/Canvas2D compositors, subtitle renderer — none change. Preview frames produce ordinary `CompositeLayer { source, opacity, zIndex }` payloads; downstream is layer-source agnostic.

---

## 9. Package-Level Change Summary

| Package | Files touched | Nature |
|---------|---------------|--------|
| `@pneuma-craft/core` | — | not changed |
| `@pneuma-craft/timeline` | `types.ts`, `events.ts`, `composition-helpers.ts`, `resolve-frame.ts`, `command-handler.ts`, `state.ts`, `undo.ts`, `index.ts` | additive |
| `@pneuma-craft/video` | `frame-renderer.ts`, `playback-engine.ts`, `export-engine.ts` | minor signature change + new option |
| `@pneuma-craft/react` | — | not changed in v1 |

---

## 10. Testing Strategy

Following the existing per-package `__tests__/*.test.ts` layout.

### `@pneuma-craft/timeline`

- `composition-helpers.test.ts`: `addPreviewFrame` insertion ordering invariant; `recomputeDuration` includes preview times
- `resolve-frame.test.ts`: scenarios A/B/C/D from the user story; multi-track z-order; `T === pf.time` boundary; `T < first pf.time` returns nothing; `track.visible === false` skipped; preview frames on audio/subtitle tracks never produced
- `command-handler.test.ts`: 4 happy paths; one rejection per invariant (locked / non-existent track / non-image asset / collision / negative time)
- `state.test.ts`: 4 events apply correctly; duration recomputed
- `undo.test.ts`: 4 compensating mappings round-trip
- `timeline-core.test.ts`: end-to-end command sequence reproducing scenarios A → B → C

### `@pneuma-craft/video`

- `frame-renderer.test.ts`:
  - `includePreviewFrames: true` + track without clip at T → preview rendered
  - `includePreviewFrames: true` + track with clip at T → preview suppressed (let-go)
  - `includePreviewFrames: false` + same composition → preview never rendered
  - Multi-track z-order: lower track's clip + upper track's preview → preview drawn on top
  - `composition.tracks` reorder changes z-order accordingly
- `playback-engine.test.ts`: default `true`; option `false` suppresses preview in `onFrameRendered` stream
- `export-engine.test.ts`: default `false` skips preview frames during export; option `true` includes them (verified by render call counts, not pixel decode)

---

## 11. Out of Scope (v1)

- ❌ Audio / subtitle preview frames — command handler rejects (I2)
- ❌ `Composition.explicitDuration` field — defer until a real use case
- ❌ Preview-frame-level fade / transition / opacity / blendMode
- ❌ React UI rendering of preview frames in `@pneuma-craft/react` — ClipCraft renders these in its own track UI for v1
- ❌ Provenance graph edges for preview-frame placement — assets already carry their own provenance; the event log captures placement audit
- ❌ A `fidelity` field on PreviewFrame — fidelity is a property of the referenced asset

---

## 12. Open Questions for v2

These are deliberately deferred:

- **Explicit duration override** — when the agent wants the timeline span to extend past the last preview/clip, or wants the last preview to display non-zero time
- **Preview frame thumbnails in `@pneuma-craft/react`** — once the React UI is back in scope, adding a thin track-overlay component for preview frames
- **Audio-side equivalent** — "draft" audio cues placed at points (e.g., narration sketch). Deferred until a real consumer asks.
