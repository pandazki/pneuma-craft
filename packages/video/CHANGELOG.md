# Changelog

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
