---
'@pneuma-craft/video': minor
'@pneuma-craft/react': minor
---

Define `PlaybackEngine`'s behavior at the end of the timeline.

Previously, `play()` with the playhead parked at the end of the composition was a no-op with a state flicker: the clock resumed from `duration`, the very first rAF tick satisfied the end-of-timeline check, and the engine re-paused. Consumers saw `playing` → `paused` inside one frame and `currentTime` never moved, so every transport UI had to discover this and hand-roll its own "rewind before play" policy.

- `play()` at the end of the timeline now rewinds to `0` and restarts, matching the HTML media element algorithm (and every video transport users already know).
- `play()` on a zero-duration composition is a documented no-op that leaves `state` untouched — no one-frame `playing` → `paused` flicker.
- New `PlaybackEngine.ended` — `true` when a composition is loaded, no `loop` region is set, `duration > 0`, and the playhead has reached the end. Positional like the media element's `ended`, so transports can render a replay affordance without re-deriving `currentTime >= duration ± ε`.
- `@pneuma-craft/react` exposes the same flag as `usePlayback().ended` (and `PneumaCraftStore.ended`).

`loop` behavior is unchanged: a loop region still bypasses the end-of-timeline pause, and keeps `ended` false.
