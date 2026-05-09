---
'@pneuma-craft/timeline': minor
'@pneuma-craft/video': minor
---

Add **PreviewFrame**, a planning-layer visual attached to a track at a single time point that lets go (does not render) when a real clip on the same track covers that moment. Powers the AIGC progressive-fidelity workflow (cheap sketch → upgraded anchor → real clip) without diluting `Clip` semantics.

`@pneuma-craft/timeline` (additive)

- New types: `PreviewFrame`, `ResolvedPreviewFrame`, `ResolvedFrame.previewFrames[]`
- `Track` gains a sorted `previewFrames: PreviewFrame[]` array
- New commands (mirroring clip ops): `composition:add-preview-frame`, `remove-preview-frame`, `move-preview-frame`, `rebind-preview-frame`
- Matching events with undo compensations
- `resolveFrame()` applies a per-track let-go rule (clip wins over preview at the same time on the same track)
- `recomputeDuration()` extends to the last preview-frame time
- New utility `buildSetPreviewFrameCommand()` for agent upsert ergonomics
- `composition:add-track` now accepts `previewFrames` as optional in its input shape (defaults to `[]`)

`@pneuma-craft/video` (additive + small internal signature)

- `createFrameRenderer`'s 5th argument now accepts `{ subtitleRenderer?, includePreviewFrames? }`. The pre-existing positional `SubtitleRenderer` form is detected and normalized — existing call sites continue to compile.
- `PlaybackEngineOptions.includePreviewFrames` (defaults to `true`) — playback shows planning visuals
- `ExportEngineOptions.includePreviewFrames` (defaults to `false`) — export = finished cut by default; opt-in for review-grade exports of unfinished timelines

See `docs/specs/2026-05-09-preview-frame-design.md` for the full design and `docs/recipes/preview-frames.md` for an integration guide.
