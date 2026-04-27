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

## Documentation

See the [pneuma-craft repository](https://github.com/pandazki/pneuma-craft) for the full design spec, architecture, and usage examples.

## License

MIT © Pandazki
