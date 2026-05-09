---
'@pneuma-craft/video': patch
---

Republish to fix stale internal dependency refs. The previous publish (`@pneuma-craft/video@0.5.0`) declared `@pneuma-craft/timeline@0.3.0` instead of `@pneuma-craft/timeline@0.4.0`, because `bun pm pack` rewrote `workspace:*` against a lockfile that `bun install --no-frozen-lockfile` had not refreshed. The CI release script now nukes `bun.lock` before re-installing, so the lockfile mirrors the bumped versions and `bun pm pack` resolves to the correct ones.

`@pneuma-craft/react` is auto-patched by changesets because it depends on `@pneuma-craft/video`; the same fix flows through to its own published deps (`timeline@0.4.0`, `video@0.5.1`).
