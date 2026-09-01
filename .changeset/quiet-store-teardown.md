---
'@pneuma-craft/react': minor
---

Stop reporting store teardown as a playback failure.

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
