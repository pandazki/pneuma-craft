# pneuma-craft

**Domain infrastructure for human-AI collaborative content creation.**

[![npm version (core)](https://img.shields.io/npm/v/%40pneuma-craft%2Fcore?label=%40pneuma-craft%2Fcore)](https://www.npmjs.com/package/@pneuma-craft/core)
[![npm version (timeline)](https://img.shields.io/npm/v/%40pneuma-craft%2Ftimeline?label=%40pneuma-craft%2Ftimeline)](https://www.npmjs.com/package/@pneuma-craft/timeline)
[![npm version (video)](https://img.shields.io/npm/v/%40pneuma-craft%2Fvideo?label=%40pneuma-craft%2Fvideo)](https://www.npmjs.com/package/@pneuma-craft/video)
[![npm version (react)](https://img.shields.io/npm/v/%40pneuma-craft%2Freact?label=%40pneuma-craft%2Freact)](https://www.npmjs.com/package/@pneuma-craft/react)
[![CI](https://github.com/pandazki/pneuma-craft/actions/workflows/ci.yml/badge.svg)](https://github.com/pandazki/pneuma-craft/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

```bash
npm install @pneuma-craft/core @pneuma-craft/timeline @pneuma-craft/video @pneuma-craft/react
# or
bun add @pneuma-craft/core @pneuma-craft/timeline @pneuma-craft/video @pneuma-craft/react
```

---

## Background

In AIGC (AI-Generated Content) workflows, content creation follows a fundamentally different pattern than traditional editing:

```
Agent generates content → Human reviews & selects → Agent iterates → Human selects again → …
```

This cycle doesn't produce a linear edit history — it produces a **tree of variants**. Every asset has provenance: who created it, what it was derived from, what parameters were used. The final output is assembled by picking nodes from this tree.

![Traditional vs AIGC](./docs/why-pneuma-craft/images/01-traditional-vs-aigc_1.png)

Existing content editors don't model this. They assume a single author working linearly on a timeline. There's no concept of "this clip was AI-generated from that image, and here are 3 alternative versions the agent produced."

## What pneuma-craft Does

pneuma-craft provides the **domain model and viewer components** for building tools where humans and AI agents co-create content. It is not a video editor — it is the workspace infrastructure that content editors can be built on.

### Provenance is the missing primitive

![Provenance Tree](./docs/why-pneuma-craft/images/02-provenance-tree_1.png)

Every asset has a story: where it came from, how it was created, what it produced. Traditional editors don't track this — they don't need to. But once agents are in the loop, lineage becomes critical for audit, reproducibility, and version management. pneuma-craft makes provenance a **first-class citizen** in the data model.

### Core abstractions

- **Asset Registry** — single source of truth for all media assets (video, image, audio, text)
- **Provenance Graph** — a DAG tracking how assets evolved: who created what, from what, when, with what parameters
- **Event-Sourced State** — all mutations flow through `Command → Event → State`. Both humans and agents use the same command interface. Full audit trail, undo via compensating events
- **Composition** — timeline arrangement of assets into final output, decoupled from the asset graph

**What it is not:** pneuma-craft does not call LLMs, generate content, or manage prompts. It is the workspace where AI-generated and human-created content meets, gets organized, and becomes a final product.

## How It Differs from Web Video Editors

|  | Traditional Web Video Editors | pneuma-craft |
|---|---|---|
| **Core abstraction** | Timeline + tracks + media files | Asset Registry + Provenance Graph + Composition |
| **Asset origin** | User uploads; editor doesn't track lineage | Every asset has full provenance (who, from what, how) |
| **State model** | Direct mutation (or simple undo stack) | Event sourcing: append-only log + state projection |
| **Actors** | Single user (or multi-user collaborative editing) | Human + Agent share the same command interface |
| **Variant management** | Not a concept | First-class citizen: generate → variants → select |
| **Product form** | Complete application | Composable domain library (headless core + optional React bindings) |

The differentiator is not "a better timeline" — it's that **provenance tracking** and **actor-aware event sourcing** don't exist in other editors.

## Architecture

### Three-Layer Domain Model

![Three-Layer Model](./docs/why-pneuma-craft/images/04-three-layer-model_1.png)

```
Asset Registry    — what exists (all media assets, metadata, tags)
        ↓
Provenance Graph  — how it got here (DAG of operations: upload, generate, derive, select)
        ↓
Composition       — what the final output looks like (tracks, clips, timeline arrangement)
```

Each layer builds on the one above. You can use only the registry (e.g. an image curation tool), only the registry + composition (a simple editor), or all three (a full provenance-aware production suite).

### Event-Sourced State

![Human-Agent Shared Interface](./docs/why-pneuma-craft/images/03-human-agent-shared_1.png)

```
Command → CommandHandler → Event(s) → EventStore → State (projection)
```

Humans and agents share the **exact same command interface**. Every event carries `actor: 'human' | 'agent'` — the log is a complete audit trail of the collaboration.

- Commands can be rejected (validation)
- Events are immutable facts
- State is rebuilt by folding events
- Undo emits compensating events (the log only grows)

### Packages

![Ecosystem](./docs/why-pneuma-craft/images/05-ecosystem_1.png)

```
@pneuma-craft/core       Domain model — asset registry, provenance graph, event system
@pneuma-craft/timeline   Composition model — tracks, clips, time-based arrangement
@pneuma-craft/video      Video engine — decode, composite, preview, export
@pneuma-craft/react      React 19 bindings — hooks, providers, headless components
```

Dependency direction:

```
react → video → timeline → core
            ↓
       mediabunny (external, video I/O)
```

**core**, **timeline**, and **video** are pure TypeScript — no React, no DOM assumptions (except video which needs Canvas/WebCodecs). They can run in Workers, Node.js, or any framework. The React layer is optional.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) >= 1.3.5 (Node.js 22+ also works for consumers) |
| Monorepo | Bun workspaces + Turborepo |
| Build | tsup (ESM + CJS + .d.ts) |
| Language | TypeScript 5.7+ strict, ESM-first |
| Testing | Vitest |
| Video I/O | [MediaBunny](https://mediabunny.dev) (WebCodecs-based) |
| React | React 19 (only in `@pneuma-craft/react`) |

## Quick Start

### Core (no UI)

```typescript
import { createCore } from '@pneuma-craft/core';

const core = createCore();

// Human uploads an image
const [registered] = core.dispatch('human', {
  type: 'asset:register',
  asset: { type: 'image', uri: '/photo.jpg', name: 'Photo', metadata: { width: 3000 } },
});
const photoId = registered.payload.asset.id;

// Track provenance
core.dispatch('human', {
  type: 'provenance:set-root',
  assetId: photoId,
  operation: { type: 'upload', actor: 'human', timestamp: Date.now() },
});

// Agent generates a variant
const [variant] = core.dispatch('agent', {
  type: 'asset:register',
  asset: { type: 'image', uri: '/photo-enhanced.jpg', name: 'Enhanced', metadata: { width: 3000 } },
});

// Link variant to parent
core.dispatch('agent', {
  type: 'provenance:link',
  fromAssetId: photoId,
  toAssetId: variant.payload.asset.id,
  operation: { type: 'derive', actor: 'agent', agentId: 'enhancer', timestamp: Date.now() },
});

// Undo the last action
core.undo();

// Query state
const state = core.getState();
console.log(state.registry.size); // 2 assets
```

### React (with video preview)

```tsx
import { PneumaCraftProvider, useEngine, VideoPreview } from '@pneuma-craft/react';

const resolver = {
  resolveUrl: (id: string) => `/api/assets/${id}`,
  fetchBlob: (id: string) => fetch(`/api/assets/${id}`).then(r => r.blob()),
};

function App() {
  return (
    <PneumaCraftProvider assetResolver={resolver}>
      <Editor />
    </PneumaCraftProvider>
  );
}

function Editor() {
  const engine = useEngine();
  return (
    <div>
      <VideoPreview />
      <button onClick={() => engine?.play()}>Play</button>
      <button onClick={() => engine?.pause()}>Pause</button>
    </div>
  );
}
```

`@pneuma-craft/react` is a **headless** layer — it gives you the wiring (Provider, hooks, the `<VideoPreview>` canvas), not the chrome. Bring your own buttons, panels, and styling.

## Documentation

- [Why pneuma-craft? — illustrated explainer](./docs/why-pneuma-craft/README.md)
- [Design specs](./docs/specs/) — detailed design docs per package
- [Recipes](./docs/recipes/) — common patterns
- Per-package docs: [core](./packages/core/docs/README.md) · [timeline](./packages/timeline/docs/README.md) · [video](./packages/video/docs/README.md) · [react](./packages/react/docs/README.md)

## Development

```bash
bun install              # Install all dependencies
bun run build            # Build all packages (via turborepo)
bun run dev              # Watch mode for all packages
bun run test             # Run all tests
bun run typecheck        # TypeScript type checking
```

### Project Structure

```
pneuma-craft/
├── packages/
│   ├── core/           # Asset registry, provenance, events, state
│   ├── timeline/       # Composition model, clip resolution, clock
│   ├── video/          # Video engine (MediaBunny-based)
│   └── react/          # React 19 bindings (hooks, providers, headless components)
├── docs/
│   ├── why-pneuma-craft/  # Illustrated explainer
│   ├── specs/             # Design specs
│   └── recipes/           # Common patterns
├── scripts/
│   └── publish.mjs     # Release script (used by GitHub Actions)
├── .changeset/         # Pending release changesets
├── .github/workflows/  # CI + changesets-driven release with npm trusted publishing
├── turbo.json
└── package.json
```

### Releasing

Releases are automated via [changesets](https://github.com/changesets/changesets) + GitHub Actions with [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (no long-lived tokens). To ship a change:

```bash
bun changeset            # Describe the change, pick affected packages and bump types
git add .changeset/      # Commit the changeset alongside your code
```

When the PR merges, CI opens a "Version Packages" PR that bumps versions and updates CHANGELOGs. Merging that PR triggers `npm publish --provenance` for the affected packages.

## Sibling Project

pneuma-craft is extracted from and consumed by [pneuma-skills](https://github.com/pandazki/pneuma-skills) — co-creation infrastructure for humans and code agents. pneuma-skills provides modes (webcraft, slide, clipcraft, etc.), an agent runtime, and a visual workspace. pneuma-craft provides the domain model + viewer components as npm libraries.

## License

MIT © Pandazki
