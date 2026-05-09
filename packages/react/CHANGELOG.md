# Changelog

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
