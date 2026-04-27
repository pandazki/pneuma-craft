# pneuma-craft Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Architecture & domain model for the pneuma-craft component library

> **Note (2026-04-27):** Original design from 2026-04-09. The current shipped
> scope diverges — `@pneuma-craft/react-ui` (Section 7) and the standalone
> example app at `examples/video-editor/` (Section 8) have been deferred and
> may return later. See the [README](../../README.md) for what's currently
> published.

---

## 1. Vision

**pneuma-craft** is an open-source TypeScript component library for building content creation tools where humans and AI agents collaborate. It provides:

1. **A domain model** for tracking assets, their provenance (who created what, from what, when), and how they're assembled into final outputs
2. **Viewer components** — starting with a video editor — that consume this model and provide interactive editing UIs
3. **An event-sourced state protocol** where both humans and agents interact through the same command interface, with full auditability

**Formula:** `AssetRegistry × ProvenanceGraph × Composition × ViewerEngine`

**Non-goals:** pneuma-craft is not an AI framework. It does not call LLMs, generate content, or manage prompts. It is the *workspace* where AI-generated and human-created content meets, gets organized, and becomes a final product. AI integration is the consumer's responsibility (e.g., pneuma-skills).

---

## 2. Package Structure

```
@pneuma-craft/core       Domain model, asset registry, provenance graph, event system
@pneuma-craft/timeline   Composition model — tracks, clips, time-based arrangement
@pneuma-craft/video      Video engine — decode, composite, preview, export
@pneuma-craft/react      React 19 bindings — components, hooks, providers
```

### Dependency Direction

```
@pneuma-craft/react
  ├── @pneuma-craft/video
  │     ├── @pneuma-craft/timeline
  │     │     └── @pneuma-craft/core
  │     ├── @pneuma-craft/core
  │     └── mediabunny (external, I/O layer)
  └── @pneuma-craft/timeline
        └── @pneuma-craft/core
```

### Package Responsibilities

| Package | Depends on | Runtime deps | Purpose |
|---------|-----------|-------------|---------|
| **core** | none | none | Asset registry, provenance graph, event store, command protocol |
| **timeline** | core | none | Composition model (tracks, clips, ordering), playback clock abstraction |
| **video** | core, timeline | mediabunny | Video decode/encode, canvas compositor, audio scheduler, export |
| **react** | core, timeline, video | react 19 | React components (TimelineUI, Preview, AssetPanel), hooks, Provider |

**Key constraint:** core, timeline, and video are **pure TypeScript** — no React, no DOM assumptions (except video which needs Canvas/WebCodecs). They can run in Workers, Node.js, or any framework.

---

## 3. Core Domain Model

### 3.1 Asset Registry

The registry is the single source of truth for all media assets in the workspace. It does not care about provenance or arrangement — just "what exists."

```typescript
type AssetType = 'video' | 'image' | 'audio' | 'text';

interface AssetMetadata {
  // Common
  size?: number;           // bytes
  // Video/Image
  width?: number;
  height?: number;
  // Video/Audio
  duration?: number;       // seconds
  codec?: string;
  sampleRate?: number;
  channels?: number;
  fps?: number;
}

interface Asset {
  id: string;              // unique identifier (nanoid)
  type: AssetType;
  uri: string;             // path or URL to the file
  name: string;            // human-readable display name
  metadata: AssetMetadata;
  createdAt: number;       // unix timestamp ms
  tags?: string[];         // user-defined tags
}
```

**Queries the registry answers:**
- Give me all assets of type X
- Give me asset by ID
- Search assets by name/tag

### 3.2 Provenance Graph

The provenance graph tracks how assets came to exist and how they evolved. It is a **DAG** (directed acyclic graph) built on top of the asset registry.

**Modeling approach: Hybrid (asset nodes + operation edges)**

- **Nodes** are assets (referenced by assetId into the registry)
- **Edges** carry operation metadata (who did what, when, with what params)
- Both "asset-centric" and "operation-centric" views are projections of the same data

```typescript
type Actor = 'human' | 'agent';

type OperationType =
  | 'upload'          // human uploaded a file
  | 'import'          // imported from external source
  | 'generate'        // AI generated from scratch
  | 'derive'          // derived from parent (transform, enhance, edit)
  | 'select'          // selected a variant as the "chosen" version
  | 'composite';      // assembled from multiple sources

interface Operation {
  type: OperationType;
  actor: Actor;
  agentId?: string;       // which agent, if actor is 'agent'
  params?: Record<string, unknown>;  // generation prompt, tool params, etc.
  label?: string;         // human-readable description
  timestamp: number;
}

interface ProvenanceEdge {
  id: string;
  fromAssetId: string | null;  // parent asset (null for root operations like upload/generate)
  toAssetId: string;           // child asset
  operation: Operation;
}

interface ProvenanceNode {
  assetId: string;        // points to Asset in registry
  parentIds: string[];    // asset IDs this was derived from
  childIds: string[];     // asset IDs derived from this
  rootOperation: Operation; // the operation that created this asset (for root nodes: upload/generate)
}
```

**Graph queries:**
- `getLineage(assetId)` → full ancestor chain to root
- `getVariants(assetId)` → all children (alternative versions)
- `getRoots()` → all assets with no parents (uploads, AI-generated from scratch)
- `getByActor(actor)` → all operations by human or agent
- `getTree(assetId)` → full subtree from a root asset

**Two view projections:**
- **Asset view:** "Show me this asset and all its variants" → navigate nodes, follow childIds
- **Operation view:** "Show me the history of operations" → collect all edges, sort by timestamp

### 3.3 Selection & Focus

Represents what the human or agent is currently focused on. Shared state that enables context-aware collaboration.

```typescript
interface Selection {
  type: 'asset' | 'clip' | 'track' | 'time-range' | 'none';
  ids: string[];
  timeRange?: { start: number; end: number };
}
```

---

## 4. Event-Sourced State Protocol

### 4.1 Architecture

All state changes flow through a strict pipeline:

```
Command → CommandHandler → Event(s) → EventStore → State (projection)
```

- **Commands** are requests to change state. They can be rejected (validation failure).
- **Events** are immutable facts — they describe what happened, not what was requested.
- **State** is a projection (fold) of the event log. It can be rebuilt from events at any time.
- **Undo** is implemented by emitting compensating events, not by mutating the log.

### 4.2 Command Types

Commands are grouped by domain:

```typescript
// ── Asset commands ─────────────────────────────────────
type AssetCommand =
  | { type: 'asset:register'; asset: Omit<Asset, 'id' | 'createdAt'> }
  | { type: 'asset:remove'; assetId: string }
  | { type: 'asset:update-metadata'; assetId: string; metadata: Partial<AssetMetadata> }
  | { type: 'asset:tag'; assetId: string; tags: string[] };

// ── Provenance commands ────────────────────────────────
type ProvenanceCommand =
  | { type: 'provenance:link'; fromAssetId: string; toAssetId: string; operation: Operation }
  | { type: 'provenance:set-root'; assetId: string; operation: Operation }
  | { type: 'provenance:unlink'; edgeId: string };

// ── Composition commands ───────────────────────────────
type CompositionCommand =
  | { type: 'composition:create'; settings: CompositionSettings }
  | { type: 'composition:add-track'; track: Omit<Track, 'id'> }
  | { type: 'composition:remove-track'; trackId: string }
  | { type: 'composition:add-clip'; trackId: string; clip: Omit<Clip, 'id'> }
  | { type: 'composition:remove-clip'; clipId: string }
  | { type: 'composition:move-clip'; clipId: string; startTime: number; trackId?: string }
  | { type: 'composition:trim-clip'; clipId: string; inPoint?: number; outPoint?: number; duration?: number }
  | { type: 'composition:reorder-tracks'; trackIds: string[] };

// ── Selection commands ─────────────────────────────────
type SelectionCommand =
  | { type: 'selection:set'; selection: Selection }
  | { type: 'selection:clear' };

type Command = (AssetCommand | ProvenanceCommand | CompositionCommand | SelectionCommand) & {
  id: string;           // unique command ID
  actor: Actor;         // who issued this command
  timestamp: number;
};
```

### 4.3 Event Types

Events mirror commands but describe what happened (past tense). They are immutable once emitted.

```typescript
type Event = {
  id: string;
  commandId: string;    // which command produced this event
  actor: Actor;
  timestamp: number;
  type: string;         // e.g., 'asset:registered', 'clip:added', 'clip:trimmed'
  payload: Record<string, unknown>;
};
```

### 4.4 Event Store

```typescript
interface EventStore {
  append(event: Event): void;
  getAll(): Event[];
  getSince(eventId: string): Event[];
  getByActor(actor: Actor): Event[];
  subscribe(listener: (event: Event) => void): () => void;
}
```

### 4.5 State & Projection

```typescript
interface PneumaCraftState {
  registry: Map<string, Asset>;
  provenance: {
    nodes: Map<string, ProvenanceNode>;
    edges: Map<string, ProvenanceEdge>;
  };
  composition: Composition;
  selection: Selection;
}

// State is rebuilt by folding events:
function projectState(events: Event[]): PneumaCraftState;

// Or incrementally updated:
function applyEvent(state: PneumaCraftState, event: Event): PneumaCraftState;
```

### 4.6 Undo/Redo

Undo does not delete events. It creates compensating events:

```
[ClipAdded] → [ClipAdded, ClipRemoved(undo)] → [ClipAdded, ClipRemoved(undo), ClipAdded(redo)]
```

The `CommandHandler` maintains an undo stack of command IDs. Undo generates the inverse command, which produces new events.

### 4.7 Documentation Requirements

The event model and state protocol are the core contract of this library. They must be documented with:
- A **protocol guide** explaining the command → event → state flow with diagrams
- A **command reference** listing every command type, its validation rules, and the events it produces
- An **event catalog** describing every event type and its payload schema
- **Examples** showing common workflows: "human uploads a file," "agent generates a variant," "user trims a clip," "undo the last action"

---

## 5. Timeline / Composition Model (`@pneuma-craft/timeline`)

### 5.1 Data Model

```typescript
interface CompositionSettings {
  width: number;
  height: number;
  fps: number;
  aspectRatio: string;    // '16:9', '9:16', '1:1'
  sampleRate?: number;    // audio, default 48000
}

type TrackType = 'video' | 'audio' | 'subtitle';

interface Track {
  id: string;
  type: TrackType;
  name: string;
  clips: Clip[];
  muted: boolean;
  volume: number;         // 0.0 - 1.0, for audio tracks
  locked: boolean;        // prevent edits
}

interface Clip {
  id: string;
  assetId: string;        // reference into Asset Registry
  trackId: string;
  startTime: number;      // position on timeline (seconds)
  duration: number;       // display duration on timeline (seconds)
  inPoint: number;        // trim start within source asset (seconds)
  outPoint: number;       // trim end within source asset (seconds)
  // Subtitle-specific
  text?: string;
  // Audio-specific
  volume?: number;        // clip-level volume override
  fadeIn?: number;        // seconds
  fadeOut?: number;       // seconds
}

interface Transition {
  id: string;
  type: 'cut' | 'crossfade' | 'fade-to-black';
  duration: number;
  fromClipId: string;
  toClipId: string;
}

interface Composition {
  id: string;
  settings: CompositionSettings;
  tracks: Track[];
  transitions: Transition[];
  duration: number;       // computed: max(track end times)
}
```

### 5.2 Playback Clock Abstraction

The timeline package provides an abstract clock interface. The video package provides the concrete implementation using `AudioContext.currentTime`.

```typescript
interface PlaybackClock {
  readonly currentTime: number;   // seconds
  readonly playing: boolean;
  readonly playbackRate: number;
  play(fromTime?: number): void;
  pause(): void;
  seek(time: number): void;
  setPlaybackRate(rate: number): void;
  onTimeUpdate(cb: (time: number) => void): () => void;
  onStateChange(cb: (playing: boolean) => void): () => void;
}
```

### 5.3 Clip Resolution

Given a time `t`, resolve which clips are active across all tracks:

```typescript
interface ResolvedFrame {
  time: number;
  clips: Array<{
    clip: Clip;
    track: Track;
    localTime: number;    // time within the clip's source asset
  }>;
}

function resolveFrame(composition: Composition, time: number): ResolvedFrame;
```

This is viewer-agnostic — the video engine uses it to know which frames to decode, but an audio-only consumer could use it for audio mixing.

---

## 6. Video Engine (`@pneuma-craft/video`)

### 6.1 Architecture

The video engine builds on MediaBunny for I/O, with self-built layers for compositing and audio:

```
MediaBunny (I/O)
  ├── Input + CanvasSink      → decode video frames
  ├── Input + AudioBufferSink → decode audio to PCM
  └── Output + CanvasSource   → encode + mux for export

Self-built (on top of MediaBunny)
  ├── Compositor              → Canvas 2D multi-layer compositing
  ├── AudioScheduler          → Web Audio API mixing + scheduling
  ├── PlaybackEngine          → rAF loop, clock sync, frame dropping
  └── ExportEngine            → frame-by-frame render + encode
```

### 6.2 Compositor

Renders a `ResolvedFrame` to a canvas:

```typescript
interface Compositor {
  readonly canvas: HTMLCanvasElement;
  renderFrame(frame: ResolvedFrame): Promise<void>;
  resize(width: number, height: number): void;
  destroy(): void;
}
```

Compositing order:
1. Clear canvas with background color
2. For each video/image clip (bottom to top by track order):
   - Decode frame at `localTime` via MediaBunny CanvasSink
   - Draw to canvas with letterbox/scale to fit
3. For each subtitle clip:
   - Render text with configured font/position/style
4. Output: single composited canvas

### 6.3 AudioScheduler

Manages Web Audio API graph for real-time multi-track playback:

```typescript
interface AudioScheduler {
  readonly audioContext: AudioContext;
  loadClip(clip: Clip, audioBuffer: AudioBuffer): void;
  play(fromTime: number): void;
  pause(): void;
  seek(time: number): void;
  setTrackVolume(trackId: string, volume: number): void;
  setTrackMute(trackId: string, muted: boolean): void;
  destroy(): void;
}
```

**Seeking strategy** (adapted from OpenReel):
1. Stop all scheduled `AudioBufferSourceNode`s
2. Calculate new buffer offsets for each active clip
3. Schedule new sources from the seek position
4. No decoder state issues because all audio is pre-decoded to `AudioBuffer`

### 6.4 PlaybackEngine

Coordinates compositor + audio scheduler with frame-accurate sync:

```typescript
interface PlaybackEngine {
  readonly clock: PlaybackClock;
  readonly compositor: Compositor;
  readonly audioScheduler: AudioScheduler;

  load(composition: Composition, assetResolver: AssetResolver): Promise<void>;
  play(): void;
  pause(): void;
  seek(time: number): void;

  onFrameRendered(cb: (time: number) => void): () => void;
}
```

**Clock strategy:** `AudioContext.currentTime` is the master clock (hardware-driven, sub-ms precision). The rAF loop reads the audio clock, determines which video frame to render, and calls the compositor. Drift detection skips or repeats frames to maintain sync.

### 6.5 ExportEngine

Renders the full composition to a video file:

```typescript
interface ExportOptions {
  format: 'mp4' | 'webm';
  videoCodec: 'avc' | 'vp9' | 'av1';
  audioCodec: 'aac' | 'opus';
  videoBitrate: number;
  audioBitrate: number;
  fps?: number;           // defaults to composition.settings.fps
}

interface ExportEngine {
  export(composition: Composition, options: ExportOptions): Promise<Blob>;
  onProgress(cb: (progress: number) => void): () => void;
  abort(): void;
}
```

Export pipeline:
1. Create MediaBunny `Output` with format + codec config
2. For each frame (0 to duration, stepping by 1/fps):
   - Call `resolveFrame(composition, t)` to get active clips
   - Call `compositor.renderFrame(frame)` to composite on canvas
   - Feed canvas to MediaBunny `CanvasSource`
3. For audio: render via `OfflineAudioContext` in chunks, feed to MediaBunny audio track
4. Finalize output → Blob

### 6.6 AssetResolver

Bridge between the asset registry and the video engine's need for actual file data:

```typescript
interface AssetResolver {
  resolveUrl(assetId: string): string;
  fetchStream(assetId: string): Promise<ReadableStream<Uint8Array>>;
  fetchBlob(assetId: string): Promise<Blob>;
}
```

Consumers provide the resolver — it might read from local files, HTTP, or IndexedDB.

---

## 7. React Bindings (`@pneuma-craft/react`)

### 7.1 Provider

```tsx
<PneumaCraftProvider
  initialState={state}
  assetResolver={resolver}
>
  <TimelinePanel />
  <PreviewPanel />
  <AssetPanel />
</PneumaCraftProvider>
```

### 7.2 Core Hooks

```typescript
// State access
useAssets(): Asset[]
useAsset(id: string): Asset | undefined
useProvenance(assetId: string): ProvenanceNode
useComposition(): Composition
useSelection(): Selection
useEventLog(filter?: EventFilter): Event[]

// Commands
useDispatch(): (command: Command) => void
useUndo(): { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }

// Playback
usePlayback(): { playing, currentTime, duration, play, pause, seek, playbackRate }

// Provenance queries
useLineage(assetId: string): Asset[]
useVariants(assetId: string): Asset[]
```

### 7.3 Components (MVP)

| Component | Purpose |
|-----------|---------|
| `<Preview />` | Video preview canvas with playback controls |
| `<Timeline />` | Multi-track timeline with clips, playhead, zoom |
| `<AssetLibrary />` | Asset browser with provenance tree view |
| `<ProvenanceTree />` | Visual tree of asset lineage (who made what from what) |

### 7.4 Design Tokens

Follow pneuma-skills' "Ethereal Tech" theme convention:
- CSS custom properties prefixed with `--pc-` (pneuma-craft)
- Dark theme default (zinc backgrounds, neon orange primary)
- All components accept `className` and `style` props for customization

---

## 8. Example App

A standalone video editor demo at `examples/video-editor/`:

- Vite + React 19
- Built-in test assets (short video clips, images, audio files)
- Demonstrates: import assets → arrange on timeline → preview → export
- Showcases provenance: upload → AI generate variant → human select → trim → final
- No AI integration — provenance is simulated for demo purposes

---

## 9. Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Bun workspaces + turborepo |
| Build (libs) | tsup (ESM + CJS + .d.ts) |
| Build (examples) | Vite 7 |
| Language | TypeScript 5.7+ strict, ESM-first |
| Testing | Vitest + @vitest/browser (for video/canvas tests) |
| Video I/O | mediabunny (sole external runtime dependency) |
| React | React 19 (only in @pneuma-craft/react) |
| Versioning | changesets |
| CI | GitHub Actions |
| Linting | ESLint + @stylistic |

---

## 10. MVP Scope

Phase 1 deliverables (what "done" looks like):

1. **@pneuma-craft/core** — Asset registry, provenance graph, event store, full command set, undo/redo
2. **@pneuma-craft/timeline** — Composition model, clip resolution, playback clock abstraction
3. **@pneuma-craft/video** — Decode, composite, preview, export (basic: cut transitions only, no effects)
4. **@pneuma-craft/react** — Provider, Preview, Timeline, AssetLibrary components
5. **Example app** — Working video editor with built-in assets
6. **Documentation** — Protocol guide, command reference, event catalog, getting started guide

**Explicitly out of scope for MVP:**
- Effects, filters, color grading
- Transitions beyond cut (crossfade, wipe — structure exists but not rendered)
- WebGL/WebGPU compositor (Canvas 2D only for MVP)
- Vue/Svelte bindings
- Canvas/image viewer (future @pneuma-craft/canvas)
- Collaborative real-time editing (multi-user)
- Server-side rendering

---

## 11. Monorepo Structure

```
pneuma-craft/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── asset-registry.ts
│   │   │   ├── provenance-graph.ts
│   │   │   ├── event-store.ts
│   │   │   ├── command-handler.ts
│   │   │   ├── state.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── timeline/
│   │   ├── src/
│   │   │   ├── composition.ts
│   │   │   ├── clip-resolver.ts
│   │   │   ├── playback-clock.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── video/
│   │   ├── src/
│   │   │   ├── compositor.ts
│   │   │   ├── audio-scheduler.ts
│   │   │   ├── playback-engine.ts
│   │   │   ├── export-engine.ts
│   │   │   ├── asset-resolver.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── react/
│       ├── src/
│       │   ├── provider.tsx
│       │   ├── hooks/
│       │   ├── components/
│       │   │   ├── Preview.tsx
│       │   │   ├── Timeline.tsx
│       │   │   ├── AssetLibrary.tsx
│       │   │   └── ProvenanceTree.tsx
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── examples/
│   └── video-editor/
│       ├── src/
│       ├── public/assets/    # built-in test media
│       ├── package.json
│       └── vite.config.ts
├── docs/
│   ├── getting-started.md
│   ├── protocol-guide.md
│   ├── command-reference.md
│   └── event-catalog.md
├── package.json
├── bun.lock                 # Bun lockfile
├── turbo.json
├── tsconfig.json
├── CLAUDE.md
└── README.md
```
