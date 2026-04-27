# @pneuma-craft/core

Domain model for human-AI collaborative content creation. Provides the asset registry, provenance graph, and event-sourced state protocol that the rest of pneuma-craft is built on.

```bash
bun add @pneuma-craft/core
```

## What's in here

- **Asset Registry** — single source of truth for all media assets (video, image, audio, text)
- **Provenance Graph** — a DAG tracking how assets evolved: who created what, from what, when, with what parameters
- **Event-Sourced State** — `Command → Event → State`. Both humans and agents share the same command interface. Full audit trail; undo via compensating events
- Pure TypeScript, no DOM / framework dependencies

## Documentation

See the [pneuma-craft repository](https://github.com/pandazki/pneuma-craft) for the full design spec, architecture, and usage examples.

## License

MIT © Pandazki
