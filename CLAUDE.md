# pneuma-craft

## Project Overview

**pneuma-craft** is an open-source TypeScript component library for building content creation tools where humans and AI agents collaborate. It provides a domain model (asset registry, provenance graph, event-sourced state), viewer components (starting with video), and React bindings.

**Key insight:** In AIGC workflows, the fundamental pattern is: Agent produces content → Human reviews and selects → This cycle repeats, creating a tree of versions/variants → The final output is assembled from selected variants. pneuma-craft provides the infrastructure for this pattern.

**Design spec:** `docs/specs/2026-04-09-pneuma-craft-design.md`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun >= 1.3.5 |
| Monorepo | Bun workspaces + turborepo |
| Build (libs) | tsup (ESM + CJS + .d.ts) |
| Build (examples) | Vite 7 |
| Language | TypeScript 5.7+ strict, ESM-first |
| Testing | Vitest + @vitest/browser |
| Video I/O | mediabunny |
| React | React 19 (only in @pneuma-craft/react) |
| Linting | ESLint + @stylistic |

## Package Structure

```
@pneuma-craft/core       Domain model, asset registry, provenance graph, event system
@pneuma-craft/timeline   Composition model — tracks, clips, time-based arrangement
@pneuma-craft/video      Video engine — decode, composite, preview, export
@pneuma-craft/react      React 19 bindings — components, hooks, providers
```

### Dependency Direction

```
react → video → timeline → core
                    ↓
              mediabunny (external)
```

**Key constraint:** core, timeline, and video are pure TypeScript — no React, no DOM assumptions (except video which needs Canvas/WebCodecs).

## Commands

```bash
bun install              # Install all dependencies
bun run build            # Build all packages (via turborepo)
bun run dev              # Watch mode for all packages
bun run test             # Run all tests
bun run typecheck        # TypeScript type checking
```

## Architecture

### Three-Layer Domain Model

1. **Asset Registry** — single source of truth for all media assets. Does not care about provenance or arrangement.
2. **Provenance Graph** — DAG tracking how assets evolved (who created what, from what, when). Built on the registry.
3. **Composition** — timeline arrangement of assets into a final product. Also built on the registry.

### Event-Sourced State Protocol

All state changes: `Command → CommandHandler → Event(s) → EventStore → State`

- Commands can be rejected (validation)
- Events are immutable facts
- State is a projection of the event log
- Undo via compensating events (log only grows)
- Every event carries `actor: 'human' | 'agent'` for audit

### Video Engine (built on MediaBunny)

- **Decode:** MediaBunny Input + CanvasSink / AudioBufferSink
- **Composite:** Self-built Canvas 2D compositor
- **Audio:** Self-built Web Audio API scheduler (AudioContext.currentTime as master clock)
- **Export:** MediaBunny Output + CanvasSource, OfflineAudioContext for audio

## Coding Conventions

- **TypeScript strict**, ESM modules, bundler resolution
- **Readonly types** — all domain interfaces use `readonly` properties
- **Pure functions** where possible — especially in core and timeline
- **No hardcoded framework assumptions** in core/timeline/video
- **English only** in source code — comments, variable names, commit messages
- **Test-driven** — write tests alongside implementation, especially for the event system

## Sibling Project: pneuma-skills

pneuma-craft is extracted from and will be consumed by **pneuma-skills** — the parent project that provides co-creation infrastructure for humans and code agents. pneuma-skills includes modes (webcraft, doc, slide, clipcraft, wuxiao, etc.), an agent runtime, and a visual workspace.

**Relationship:** pneuma-craft provides the domain model + viewer components as an npm library. pneuma-skills imports and uses them inside its modes (e.g., clipcraft mode will migrate from its inline video editor to @pneuma-craft/video + @pneuma-craft/react).

**When to reference pneuma-skills:**
- Understanding how pneuma-craft will be consumed (mode manifests, skill system, viewer contracts)
- Reviewing the existing clipcraft/wuxiao implementation for domain model insights
- Checking pneuma's design philosophy (ModeManifest, ViewerContract, "no hardcoded mode knowledge")

**Local path:** See `CLAUDE.local.md` for the local code path to pneuma-skills.

## Project Structure

```
pneuma-craft/
├── packages/
│   ├── core/           # Asset registry, provenance, events, state
│   ├── timeline/       # Composition model, clip resolution, clock
│   ├── video/          # Video engine (MediaBunny-based)
│   └── react/          # React components and hooks
├── examples/
│   └── video-editor/   # Standalone demo app
├── docs/
│   └── specs/          # Design specs
├── package.json        # Root workspace config
├── turbo.json          # Turborepo config
└── CLAUDE.md           # This file
```
