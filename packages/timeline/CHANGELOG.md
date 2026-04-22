# Changelog

All notable changes to `@pneuma-craft/timeline` will be documented in this file.

## 0.2.0

### Fixed

- `resolveFrame` now honors `Track.visible === false` — hidden tracks are excluded from the resolved frame so they neither render in preview nor appear in export. This is the video-layer equivalent of the existing `muted` guard for audio. Behavior for `visible: true` and `visible: undefined` (legacy compositions) is unchanged.

## 0.1.0

- Initial release.
