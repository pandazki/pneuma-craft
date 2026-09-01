# @pneuma-craft/react

React 19 bindings for pneuma-craft — components, hooks, and providers that wrap [`@pneuma-craft/core`](https://www.npmjs.com/package/@pneuma-craft/core), [`@pneuma-craft/timeline`](https://www.npmjs.com/package/@pneuma-craft/timeline), and [`@pneuma-craft/video`](https://www.npmjs.com/package/@pneuma-craft/video).

```bash
bun add @pneuma-craft/react react react-dom
```

Requires React 19+.

## What's in here

- **Providers** — Zustand-backed stores for project, timeline, and engine state
- **Hooks** — `useProject`, `useComposition`, `usePlayback`, `useEngine`, command dispatchers, and selectors
- **Components** — `<VideoPreview>` and friends; designed to be composable into your own editor UI
- **No bundled UI chrome** — bring your own buttons and layout; this package is the wiring, not the look

## Teardown vs. failure

Work that is in flight when a store is destroyed — a provider unmount, a React
StrictMode double-mount, a hot reload — is cancelled, not failed. Those
cancellations surface as `StoreDestroyedError` and are **not** logged: the
store's fire-and-forget paths (`play()`, `seek()`) drop them silently, so
`[PneumaCraft] Failed to …` in the console always means something actually went
wrong.

Awaited APIs still reject, so you can branch on it:

```ts
import { isStoreDestroyedError } from '@pneuma-craft/react';

try {
  await exportComposition(options);
} catch (err) {
  if (isStoreDestroyedError(err)) return; // unmounted mid-export, nothing to report
  showError(err);
}
```

Prefer `isStoreDestroyedError(err)` over `err instanceof StoreDestroyedError` —
it is a brand check, so it holds even when the error crossed a module boundary
(two copies of the package in one bundle, a dev-server graph reloaded in place).

## Documentation

See the [pneuma-craft repository](https://github.com/pandazki/pneuma-craft) for the full design spec, architecture, and usage examples.

## License

MIT © Pandazki
