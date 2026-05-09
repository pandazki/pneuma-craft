# Changelog

## 0.5.0

### Minor Changes

- c7a09ae: Add **PreviewFrame**, a planning-layer visual attached to a track at a single time point that lets go (does not render) when a real clip on the same track covers that moment. Powers the AIGC progressive-fidelity workflow (cheap sketch → upgraded anchor → real clip) without diluting `Clip` semantics.

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

### Patch Changes

- Updated dependencies [c7a09ae]
  - @pneuma-craft/timeline@0.4.0

All notable changes to `@pneuma-craft/video` will be documented in this file.

## 0.4.0

### Fixed

- **Video clips with embedded audio now play and export with sound.** Previously the audio scheduler, audio preload, and offline audio renderer all hard-filtered to `track.type === 'audio'`, so any video clip dropped on a `video` track was silent in both preview and export — only clips on dedicated audio tracks produced sound. All three paths now include `video` tracks and attempt `decodeAudio` on every clip; clips whose asset has no audio stream (images, silent videos) are silently skipped. Mute gate is `track.muted` for both track types, matching standard NLE semantics.

### Peer dependency

- Requires `@pneuma-craft/timeline >= 0.3.0` for the split `muted` (audio) / `visible` (picture) semantics. Pinning an older timeline still works but muting a video track will also hide its picture.

## 0.3.0

### Added

- `SubtitleRenderer` injection point shared by preview (`createPlaybackEngine`) and export (`createExportEngine`). See commit `3b014c5` for details.

## 0.2.0

### Fixed

- Preserve alpha channel end-to-end for transparent layers (Canvas2D + WebGPU compositors, image letterbox, mediabunny CanvasSink `alpha: true`).

## 0.1.0

- Initial release.
