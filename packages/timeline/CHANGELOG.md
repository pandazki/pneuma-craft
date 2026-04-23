# Changelog

All notable changes to `@pneuma-craft/timeline` will be documented in this file.

## 0.3.0

### Changed (semantics)

- **`resolveFrame` no longer skips `muted` tracks.** `muted` is a pure audio concept (enforced downstream by the audio scheduler and offline renderer); `resolveFrame` is the picture path. Previous behavior coupled the two, so muting a video track would also hide its picture — inconsistent with standard NLE semantics. Now `muted` and `visible` are orthogonal: `muted: true` silences audio, `visible: false` hides the picture.

### Migration

- If you relied on `muted: true` to hide a video track's picture, switch to `visible: false`.

## 0.2.0

### Fixed

- `resolveFrame` now honors `Track.visible === false` — hidden tracks are excluded from the resolved frame so they neither render in preview nor appear in export. This is the video-layer equivalent of the existing `muted` guard for audio. Behavior for `visible: true` and `visible: undefined` (legacy compositions) is unchanged.

## 0.1.0

- Initial release.
