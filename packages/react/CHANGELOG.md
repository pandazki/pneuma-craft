# Changelog

## 0.5.0

### Minor Changes

- b594189: Stop reporting store teardown as a playback failure.

  Work waiting on the lazy playback-engine init used to reject with `Error: Store destroyed` once the store was destroyed, and the store logged it through the same channel, level and wording as a real failure:

  ```
  [PneumaCraft] Failed to seek: Error: Store destroyed
  ```

  React StrictMode alone produced 1–3 of these per page load, which pre-poisons the one message a consumer actually needs to trust when a seek really does fail.

  - Teardown-cancelled work is now abandoned quietly. `play()` and `seek()` swallow it; `[PneumaCraft] Failed to …` again means something genuinely went wrong.
  - New `StoreDestroyedError` (exported) marks the cancellation, with `isStoreDestroyedError(err)` as the machine-checkable test — a brand check, so it survives the error crossing a module boundary where `instanceof` would not. Awaited APIs such as `exportComposition()` still reject with it, so callers can branch on it instead of matching message strings.
  - `seek()` / `play()` after teardown no longer reach for the `@pneuma-craft/video` chunk at all.
  - The composition-reload path now prefixes its log (`[PneumaCraft] Failed to reload composition:`) instead of dumping a bare error, and stays quiet on teardown too.

  The guards themselves are unchanged — cancelling in-flight work against a destroyed store was always correct; only the reporting changed.

## 0.4.0

### Minor Changes

- 4465530: Define `PlaybackEngine`'s behavior at the end of the timeline.

  Previously, `play()` with the playhead parked at the end of the composition was a no-op with a state flicker: the clock resumed from `duration`, the very first rAF tick satisfied the end-of-timeline check, and the engine re-paused. Consumers saw `playing` → `paused` inside one frame and `currentTime` never moved, so every transport UI had to discover this and hand-roll its own "rewind before play" policy.

  - `play()` at the end of the timeline now rewinds to `0` and restarts, matching the HTML media element algorithm (and every video transport users already know).
  - `play()` on a zero-duration composition is a documented no-op that leaves `state` untouched — no one-frame `playing` → `paused` flicker.
  - New `PlaybackEngine.ended` — `true` when a composition is loaded, no `loop` region is set, `duration > 0`, and the playhead has reached the end. Positional like the media element's `ended`, so transports can render a replay affordance without re-deriving `currentTime >= duration ± ε`.
  - `@pneuma-craft/react` exposes the same flag as `usePlayback().ended` (and `PneumaCraftStore.ended`).

  `loop` behavior is unchanged: a loop region still bypasses the end-of-timeline pause, and keeps `ended` false.

### Patch Changes

- Updated dependencies [4465530]
  - @pneuma-craft/video@0.6.0

## 0.3.2

### Patch Changes

- Updated dependencies [eecee02]
  - @pneuma-craft/video@0.5.1

## 0.3.1

### Patch Changes

- Updated dependencies [c7a09ae]
  - @pneuma-craft/timeline@0.4.0
  - @pneuma-craft/video@0.5.0

All notable changes to `@pneuma-craft/react` will be documented in this file.

## 0.3.0

### Changed

- Inherits `@pneuma-craft/video@0.4.0` — video clips with embedded audio now play through the store's playback engine and show up in exports. No API change; existing stores behave better without any code change downstream.

## 0.2.0

### Added

- `subtitleRenderer` prop on `PneumaCraftProvider` + `PneumaCraftStoreOptions` — rasterizer shared by preview and export. See `@pneuma-craft/video@0.3.0`.

## 0.1.0

- Initial release.
