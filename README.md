# pneuma-craft

Domain infrastructure for human-AI collaborative content creation.

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
@pneuma-craft/react      React 19 bindings — components, hooks, providers
```

Dependency direction:

```
react → video → timeline → core
                    ↓
              mediabunny (external, video I/O)
```

**core**, **timeline**, and **video** are pure TypeScript — no React, no DOM assumptions (except video which needs Canvas/WebCodecs). They can run in Workers, Node.js, or any framework.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Monorepo | Bun workspaces + Turborepo |
| Build | tsup (ESM + CJS + .d.ts) |
| Language | TypeScript 5.7+ strict, ESM-first |
| Testing | Vitest |
| Video I/O | [MediaBunny](https://mediabunny.dev) (WebCodecs-based) |
| React | React 19 (only in @pneuma-craft/react) |

## Getting Started

```bash
bun install
bun run build
bun run test
```

## License

MIT
