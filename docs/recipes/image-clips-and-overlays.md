# Recipe: image clips and overlays

**Applies to:** `@pneuma-craft/core`, `@pneuma-craft/timeline`, `@pneuma-craft/video` ≥ 0.1.5

A `Clip` in pneuma-craft is a generic "asset occupies a time window on a track" record — nothing about it assumes the asset is a video. An `image`-type asset dropped onto a `video` track becomes a **static clip with duration**: the same `ImageBitmap` is rendered for every frame in the clip's window.

This recipe covers two common cases:

1. [Static image slide](#1-static-image-slide) — an image takes a time slice of its own on the main track
2. [Main video + overlay image](#2-main-video--overlay-image) — an image is layered over the running video for a few seconds

Multi-video split-screen and Ken Burns zoom/pan require per-clip `transform` (not yet shipped — tracked under "future work" at the end).

---

## Prerequisites

The composition-layer code is the same whether the asset is a video or an image. You just need an `AssetResolver` that returns an image blob for the image asset IDs — that's your app's concern, not pneuma-craft's.

```ts
import type { AssetResolver } from '@pneuma-craft/video';

const resolver: AssetResolver = {
  resolveUrl(assetId) {
    // Return whatever URL your app uses to serve this asset
    return `/assets/${assetId}`;
  },
  async fetchBlob(assetId) {
    const res = await fetch(`/assets/${assetId}`);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    return res.blob(); // image/png, image/jpeg, image/webp, etc.
  },
};
```

> The decoder inspects the blob at playback time. If it's a recognized video container, it uses MediaBunny's `CanvasSink`. If not, it falls back to `createImageBitmap(blob)`, caches the result, and returns the same `ImageBitmap` regardless of timestamp. No MIME check or branching is needed in your app code.

---

## 1. Static image slide

Register an image asset, then add a clip on a `video` track with whatever `duration` you want.

```ts
import { createTimelineCore } from '@pneuma-craft/timeline';

const core = createTimelineCore();

// 1. Register the asset — type is 'image'
const [registerEvent] = core.dispatch('human', {
  type: 'asset:register',
  asset: {
    type: 'image',
    uri: '/assets/title-card.png',
    name: 'Title Card',
    metadata: { width: 1920, height: 1080 },
  },
});
const imageAssetId = (registerEvent as { payload: { asset: { id: string } } }).payload.asset.id;

// 2. Create a composition
core.dispatch('human', {
  type: 'composition:create',
  settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9', sampleRate: 48000 },
});

// 3. Add a video track
core.dispatch('human', {
  type: 'composition:add-track',
  track: {
    type: 'video', // image clips live on video tracks
    name: 'Main',
    clips: [],
    muted: false, volume: 1, locked: false, visible: true,
  },
});
const trackId = core.getComposition()!.tracks[0].id;

// 4. Add the image clip — duration is how long the image stays on screen.
//    inPoint/outPoint are ignored by the image decoder; set them to (0, duration).
core.dispatch('human', {
  type: 'composition:add-clip',
  trackId,
  clip: {
    assetId: imageAssetId,
    startTime: 0,
    duration: 5,   // 5 seconds of still image
    inPoint: 0,
    outPoint: 5,
  },
});
```

That's it. `PlaybackEngine` will render the same `ImageBitmap` for all frames in `[0, 5)`, and the composition's `duration` is 5 seconds.

---

## 2. Main video + overlay image

Two tracks. Track order = stacking order — **later tracks render on top of earlier ones**. Put the main video on track A, the overlay image on track B.

```ts
const core = createTimelineCore();

// Assume you've already registered videoAssetId and overlayAssetId via asset:register.

core.dispatch('human', {
  type: 'composition:create',
  settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9', sampleRate: 48000 },
});

// Track A — main video track (added first → bottom of the stack)
core.dispatch('human', {
  type: 'composition:add-track',
  track: { type: 'video', name: 'Main', clips: [], muted: false, volume: 1, locked: false, visible: true },
});
const mainTrackId = core.getComposition()!.tracks[0].id;

// Track B — overlay image track (added second → top of the stack)
core.dispatch('human', {
  type: 'composition:add-track',
  track: { type: 'video', name: 'Overlay', clips: [], muted: false, volume: 1, locked: false, visible: true },
});
const overlayTrackId = core.getComposition()!.tracks[1].id;

// Main video: plays from t=0 to t=30
core.dispatch('human', {
  type: 'composition:add-clip',
  trackId: mainTrackId,
  clip: {
    assetId: videoAssetId,
    startTime: 0,
    duration: 30,
    inPoint: 0,
    outPoint: 30,
  },
});

// Overlay image: shows for 5 seconds starting at t=10
core.dispatch('human', {
  type: 'composition:add-clip',
  trackId: overlayTrackId,
  clip: {
    assetId: overlayAssetId,
    startTime: 10,
    duration: 5,
    inPoint: 0,
    outPoint: 5,
  },
});

// Hand composition + resolver to the playback engine — no further setup.
const composition = core.getComposition()!;
// await engine.load(composition, resolver);
// engine.play();
```

### What happens at each time

| Time   | Active clips             | Rendered output                            |
| ------ | ------------------------ | ------------------------------------------ |
| `t=5`  | main                     | main video frame                           |
| `t=12` | main + overlay           | main video frame **with image on top**     |
| `t=16` | main                     | main video frame (overlay window has ended)|
| `t=25` | main                     | main video frame                           |

`resolveFrame(composition, t)` picks every clip whose `[startTime, startTime + duration)` includes `t`. `frame-renderer` decodes each one and hands them to the compositor with `zIndex = i` where `i` is the index in the resolved list — which follows track order in `composition.tracks`. So tracks added later render on top.

### Updating the overlay window

Want to change when the overlay appears? Use `composition:move-clip` to shift `startTime`, or `composition:trim-clip` to change `duration`. All edits flow through the event log and support undo.

```ts
// Show the overlay from t=8 to t=14 instead
core.dispatch('human', {
  type: 'composition:move-clip',
  clipId: overlayClipId,
  newStartTime: 8,
});
core.dispatch('human', {
  type: 'composition:trim-clip',
  clipId: overlayClipId,
  duration: 6,
  outPoint: 6,
});
```

---

## React integration

If you're using `@pneuma-craft/react`, all of this goes through `store.dispatch('human', command)` — same commands, same semantics. The `<PreviewRoot>` canvas will paint the composited frames automatically once you `store.play()` (or even `store.seek(t)` with ≥ 0.1.3).

```tsx
function MyEditor() {
  const playback = usePlayback();
  const dispatch = useDispatch();

  const addOverlay = () => {
    dispatch('human', {
      type: 'composition:add-clip',
      trackId: overlayTrackId,
      clip: { assetId: overlayAssetId, startTime: 10, duration: 5, inPoint: 0, outPoint: 5 },
    });
  };

  return (
    <>
      <PreviewRoot>{({ canvasRef }) => <canvas ref={canvasRef} width={1920} height={1080} />}</PreviewRoot>
      <button onClick={addOverlay}>Add overlay</button>
      <button onClick={() => playback.play()}>Play</button>
    </>
  );
}
```

---

## Future work

The current `CompositeLayer` has `source`, `opacity`, and `zIndex`, but no **transform**. That means:

- **Split-screen** (main top half + another video bottom half) — needs per-clip `{ x, y, scaleX, scaleY }` or `crop`
- **Picture-in-picture** — same
- **Ken Burns / pan-zoom on stills** — needs per-clip transform **with keyframes**

All three are the same extension point: add an optional `transform?: ClipTransform` field on `Clip`, let `resolveFrame` compute its interpolated value at `localTime`, surface it on `ResolvedClip`, plumb it into `CompositeLayer`, and apply it in the compositor via `ctx.setTransform()` + `drawImage(..., sx, sy, sw, sh, dx, dy, dw, dh)`. This is on the roadmap but not shipped yet. If you need one of these today, open an issue describing the specific use case so the API can be shaped around real requirements.
