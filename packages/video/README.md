# @pneuma-craft/video

Video engine for pneuma-craft — decode, composite, preview, and export. Built on [MediaBunny](https://mediabunny.dev) (WebCodecs) for I/O, with self-built Canvas 2D compositor and Web Audio scheduler for playback.

```bash
bun add @pneuma-craft/video
```

## What's in here

- **Decoder** — MediaBunny `Input` + `CanvasSink` / `AudioBufferSink`
- **Compositor** — Canvas 2D layer compositor with transforms, opacity, blend modes
- **Audio scheduler** — Web Audio graph with `AudioContext.currentTime` as master clock; drift-corrected against video
- **Preview engine** — drives a rAF loop to play a `@pneuma-craft/timeline` composition
- **Exporter** — renders frame-by-frame via WebCodecs `VideoEncoder`, mixes audio via `OfflineAudioContext`, muxes via MediaBunny `Output`
- **Pluggable subtitle renderer** — shared between preview and export

## Browser support

Requires WebCodecs (`VideoDecoder`/`VideoEncoder`) and modern Canvas 2D. Tested on Chromium-based browsers and Safari Tech Preview.

## Documentation

See the [pneuma-craft repository](https://github.com/pandazki/pneuma-craft) for the full design spec, architecture, and usage examples.

## License

MIT © Pandazki
