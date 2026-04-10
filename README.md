# pneuma-craft

**Domain infrastructure for human-AI collaborative content creation.**

<pre>bun add @pneuma-craft/core @pneuma-craft/timeline @pneuma-craft/video @pneuma-craft/react @pneuma-craft/react-ui</pre>

---

## Background

In AIGC (AI-Generated Content) workflows, content creation follows a fundamentally different pattern than traditional editing:

```
Agent generates content → Human reviews & selects → Agent iterates → Human selects again → …
```

This cycle doesn't produce a linear edit history — it produces a **tree of variants**. Every asset has provenance: who created it, what it was derived from, what parameters were used. The final output is assembled by picking nodes from this tree.

Existing content editors don't model this. They assume a single author working linearly on a timeline. There's no concept of "this clip was AI-generated from that image, and here are 3 alternative versions the agent produced."

## What pneuma-craft Does

pneuma-craft provides the **domain model and viewer components** for building tools where humans and AI agents co-create content. It is not a video editor — it is the workspace infrastructure that content editors can be built on.

**Core abstractions:**

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
| **Product form** | Complete application | Composable domain library (headless core + optional React UI) |

The differentiator is not "a better timeline" — it's that **provenance tracking** and **actor-aware event sourcing** don't exist in other editors.

## Architecture

### Three-Layer Domain Model

```
Asset Registry    — what exists (all media assets, metadata, tags)
        ↓
Provenance Graph  — how it got here (DAG of operations: upload, generate, derive, select)
        ↓
Composition       — what the final output looks like (tracks, clips, timeline arrangement)
```

### Event-Sourced State

```
Command → CommandHandler → Event(s) → EventStore → State (projection)
```

- Commands can be rejected (validation)
- Events are immutable facts
- State is rebuilt by folding events
- Undo emits compensating events (the log only grows)
- Every event carries `actor: 'human' | 'agent'`

### Packages

```
@pneuma-craft/core       Domain model, asset registry, provenance graph, event system
@pneuma-craft/timeline   Composition model — tracks, clips, time-based arrangement
@pneuma-craft/video      Video engine — decode, composite, preview, export
@pneuma-craft/react      React 19 bindings — headless components, hooks, providers
@pneuma-craft/react-ui   Styled UI components — Preview, Timeline, AssetLibrary, ProvenanceTree
```

Dependency direction:

```
react-ui → react → video → timeline → core
                       ↓
                 mediabunny (external, video I/O)
```

**core**, **timeline**, and **video** are pure TypeScript — no React, no DOM assumptions (except video which needs Canvas/WebCodecs). They can run in Workers, Node.js, or any framework.

## Status

| Package | Tests | Review Rounds | Description |
|---------|-------|---------------|-------------|
| `@pneuma-craft/core` | 86 | 6 | Event store, command handler, state projection, provenance graph, undo/redo |
| `@pneuma-craft/timeline` | 72 | 6 | Composition model, clip resolution, commands, undo, TimelineCore facade |
| `@pneuma-craft/video` | 186 | 6 | Video engine — decode, composite, preview, export |
| `@pneuma-craft/react` | 62 | 6 | Headless React 19 bindings — Provider, hooks, headless components |
| `@pneuma-craft/react-ui` | 26 | 5 | Styled components — Preview, Timeline, AssetLibrary, ProvenanceTree |

See each package's `docs/` directory for detailed API documentation.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) >= 1.3.5 |
| Monorepo | Bun workspaces + Turborepo |
| Build | tsup (ESM + CJS + .d.ts) |
| Language | TypeScript 5.7+ strict, ESM-first |
| Testing | Vitest |
| Video I/O | [MediaBunny](https://mediabunny.dev) (WebCodecs-based) |
| React | React 19 (only in @pneuma-craft/react and @pneuma-craft/react-ui) |

## Getting Started

```bash
bun install
bun run build
bun run test
```

### Running the Example

The repository includes a standalone video editor demo built with `@pneuma-craft/react-ui`:

```bash
cd examples/video-editor
bun run dev
```

This launches a Vite dev server with an interactive editor featuring Preview, Timeline, AssetLibrary, and ProvenanceTree panels.

### Quick Example (Core)

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

### Quick Example (React)

```tsx
import { PneumaCraftProvider } from '@pneuma-craft/react';
import { Preview, Timeline, AssetLibrary, Panel } from '@pneuma-craft/react-ui';
import '@pneuma-craft/react-ui/dist/index.css';

const resolver = {
  resolveUrl: (id: string) => `/api/assets/${id}`,
  fetchBlob: (id: string) => fetch(`/api/assets/${id}`).then(r => r.blob()),
};

function App() {
  return (
    <PneumaCraftProvider assetResolver={resolver}>
      <div style={{ display: 'flex', height: '100vh' }}>
        <Panel title="Assets">
          <AssetLibrary />
        </Panel>
        <Preview />
      </div>
      <Timeline
        onClipMove={(id, time) => { /* handle move */ }}
        onClipSplit={(id, time) => { /* handle split */ }}
      />
    </PneumaCraftProvider>
  );
}
```

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
│   ├── react/          # React headless components and hooks
│   └── react-ui/       # Styled UI components
├── examples/
│   └── video-editor/   # Standalone demo app (Vite 7)
├── docs/
│   └── specs/          # Design specs
├── package.json        # Root workspace config
├── turbo.json          # Turborepo config
└── CLAUDE.md           # AI assistant instructions
```

## Sibling Project

pneuma-craft is extracted from and consumed by [pneuma-skills](https://github.com/pandazki/pneuma-skills) — co-creation infrastructure for humans and code agents. pneuma-skills provides modes (webcraft, slide, clipcraft, etc.), an agent runtime, and a visual workspace. pneuma-craft provides the domain model + viewer components as npm libraries.

## License

MIT
