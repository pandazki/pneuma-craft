# @pneuma-craft/timeline

Composition model for pneuma-craft — tracks, clips, and time-based arrangement built on top of [`@pneuma-craft/core`](https://www.npmjs.com/package/@pneuma-craft/core).

```bash
bun add @pneuma-craft/timeline
```

## What's in here

- **Timeline domain types** — tracks, clips, compositions, transforms
- **Clip resolution** — `resolveFrame(time)` returns the layers visible at any point in time
- **Command/event pairs** — add/remove track, add/remove clip, move clip, trim, split, rebind asset, toggle visibility/mute, rename
- **Pure TypeScript** — no DOM, no rendering; that's the video package's job

## Documentation

See the [pneuma-craft repository](https://github.com/pandazki/pneuma-craft) for the full design spec, architecture, and usage examples.

## License

MIT © Pandazki
