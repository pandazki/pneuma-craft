# @pneuma-craft/react-ui Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Styled React components built on @pneuma-craft/react headless layer
**Depends on:** @pneuma-craft/react, @pneuma-craft/video, @pneuma-craft/timeline, @pneuma-craft/core
**Styling:** CSS Modules + CSS custom properties (no css-in-js, no Tailwind dependency)

---

## 1. Purpose

`@pneuma-craft/react-ui` provides opinionated, styled React components that wrap the headless layer from `@pneuma-craft/react`. It is the "open the box and it works" UI for building video editing interfaces.

**What it does:**
- Design tokens via CSS custom properties (`--pc-*`)
- Styled components: Preview, Timeline, AssetLibrary, ProvenanceTree
- Base UI atoms: Button, IconButton, Panel
- Compound component API for flexible composition
- Dark theme default, customizable via CSS custom properties

**What it does not do:**
- Manage state (delegates to `@pneuma-craft/react` hooks)
- Handle video decode/render (delegates to `@pneuma-craft/video`)
- Force layout decisions (components are panels, consumer arranges them)

**Relationship to `@pneuma-craft/react`:**
Every styled component wraps a headless component or hook from `@pneuma-craft/react`. Consumer can swap any styled component for their own by using the headless layer directly.

---

## 2. Design Language

### Color Palette

Based on pneuma-skills' "Ethereal Tech" theme, adapted with `--pc-` prefix:

```css
:root {
  /* Backgrounds */
  --pc-bg: #09090b;              /* Zinc 950 — app background */
  --pc-surface: #18181b;          /* Zinc 900 — panels, cards */
  --pc-surface-hover: #27272a;    /* Zinc 800 — hover state */
  --pc-surface-active: #3f3f46;   /* Zinc 700 — active/pressed */

  /* Foreground */
  --pc-fg: #fafafa;               /* Primary text */
  --pc-fg-muted: #a1a1aa;         /* Zinc 400 — secondary text */
  --pc-fg-dim: #71717a;           /* Zinc 500 — tertiary text */

  /* Accent */
  --pc-primary: #f97316;          /* Orange 500 — primary action */
  --pc-primary-hover: #fdba74;    /* Orange 300 — hover */
  --pc-primary-muted: rgba(249, 115, 22, 0.15); /* Glow/selection */

  /* Borders */
  --pc-border: rgba(255, 255, 255, 0.08);
  --pc-border-hover: rgba(255, 255, 255, 0.15);

  /* Status */
  --pc-success: #4ade80;
  --pc-error: #f87171;
  --pc-warning: #facc15;

  /* Spacing scale */
  --pc-space-1: 4px;
  --pc-space-2: 8px;
  --pc-space-3: 12px;
  --pc-space-4: 16px;
  --pc-space-6: 24px;
  --pc-space-8: 32px;

  /* Radius */
  --pc-radius-sm: 4px;
  --pc-radius-md: 8px;
  --pc-radius-lg: 12px;
  --pc-radius-full: 9999px;

  /* Typography */
  --pc-font-sans: "DM Sans", system-ui, -apple-system, sans-serif;
  --pc-font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --pc-font-size-xs: 11px;
  --pc-font-size-sm: 13px;
  --pc-font-size-base: 14px;

  /* Transitions */
  --pc-transition: 150ms ease;

  /* Shadows */
  --pc-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  --pc-shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.4);
  --pc-glow: 0 0 12px rgba(249, 115, 22, 0.3);
}
```

### Theme Customization

Consumers override tokens at the provider level:

```css
.my-app {
  --pc-primary: #3b82f6;          /* Switch to blue accent */
  --pc-bg: #1a1a2e;               /* Custom background */
}
```

Or in React:

```tsx
<div style={{ '--pc-primary': '#3b82f6' } as React.CSSProperties}>
  <Preview />
  <Timeline />
</div>
```

---

## 3. Component Architecture

### Dependency Direction

```
@pneuma-craft/react-ui
  ├── imports hooks from @pneuma-craft/react
  ├── imports headless components from @pneuma-craft/react
  ├── imports types from @pneuma-craft/timeline, @pneuma-craft/core
  └── provides CSS Modules (bundled as plain CSS)
```

### Component API Pattern

Every component:
- Accepts `className?: string` for consumer override
- Accepts `style?: React.CSSProperties` for inline customization
- Uses CSS Modules internally (`.module.css` files)
- Wraps a headless component from `@pneuma-craft/react`
- Is a compound component where appropriate

---

## 4. Components

### 4.1 Preview

Video preview canvas with playback controls.

```tsx
<Preview className="my-preview" />
```

**DOM structure:**
```
div.preview
  ├── div.preview-canvas-container
  │     └── canvas (from PreviewRoot canvasRef)
  └── div.preview-controls
        ├── IconButton (play/pause)
        ├── span.preview-time (currentTime / duration)
        ├── input[range].preview-seekbar (playhead scrubber)
        └── IconButton (fullscreen — future)
```

**Behavior:**
- Wraps `<PreviewRoot>` from `@pneuma-craft/react`
- Uses `usePlayback()` for play/pause/seek/time display
- Seekbar is an `<input type="range">` styled with CSS custom properties
- Canvas maintains aspect ratio via CSS `aspect-ratio` from composition settings
- Shows loading spinner when `isLoading`

**No compound split** — Preview is a cohesive unit, not worth splitting.

### 4.2 Timeline

Multi-track timeline with clips, playhead, and zoom controls.

```tsx
// Full auto-render
<Timeline />

// Compound — rearrange parts
<Timeline>
  <Timeline.Toolbar />
  <Timeline.TrackList />
  <Timeline.Playhead />
</Timeline>
```

**Compound components:**

```tsx
Timeline          // Root container, wraps TimelineRoot headless
Timeline.Toolbar  // Zoom slider, snap toggle
Timeline.TrackList // Renders all tracks with clips
Timeline.Track    // Single track row (header + clips)
Timeline.Clip     // Single clip block (colored by type, shows name)
Timeline.Playhead // Vertical line following currentTime
```

**DOM structure (default):**
```
div.timeline
  ├── div.timeline-toolbar
  │     ├── span.timeline-duration
  │     └── input[range].timeline-zoom (pixelsPerSecond)
  ├── div.timeline-body (scrollable)
  │     ├── div.timeline-tracks
  │     │     └── div.timeline-track (per track)
  │     │           ├── div.timeline-track-header (name, mute, lock icons)
  │     │           └── div.timeline-track-clips (positioned clips)
  │     │                 └── div.timeline-clip (absolute positioned)
  │     └── div.timeline-playhead (absolute, vertical line)
  └── div.timeline-ruler (time markers at top)
```

**Behavior:**
- Wraps `<TimelineRoot>` headless component
- Clips positioned via `left: timeToPixels(clip.startTime)`, `width: timeToPixels(clip.duration)`
- Clip colors by track type: video = blue, audio = green, subtitle = yellow
- Playhead: orange vertical line at `playheadPosition` pixels
- Horizontal scroll follows playhead during playback
- Zoom: adjusts `pixelsPerSecond` (range: 10-500)
- Track header: track name, mute/lock toggle icons

### 4.3 AssetLibrary

Asset browser with filtering and grid/list view.

```tsx
// Full auto-render
<AssetLibrary />

// Compound
<AssetLibrary>
  <AssetLibrary.Filter />
  <AssetLibrary.Grid />
</AssetLibrary>
```

**Compound components:**

```tsx
AssetLibrary         // Root container, wraps AssetLibraryRoot
AssetLibrary.Filter  // Type filter tabs (all, video, image, audio, text)
AssetLibrary.Grid    // Grid of asset cards
AssetLibrary.Item    // Single asset card (thumbnail, name, type badge)
```

**DOM structure (default):**
```
div.asset-library
  ├── div.asset-library-filter
  │     └── button.filter-tab (per type: all, video, image, audio, text)
  └── div.asset-library-grid
        └── div.asset-library-item (per asset)
              ├── div.item-thumbnail (placeholder or preview)
              ├── span.item-name
              └── span.item-type-badge
```

**Behavior:**
- Wraps `<AssetLibraryRoot>` headless component
- Filter tabs: "All", "Video", "Image", "Audio", "Text" — maps to `AssetType`
- Selected asset highlighted with `--pc-primary-muted` background
- Click to select, calls `onAssetSelect`
- Grid layout: `grid-template-columns: repeat(auto-fill, minmax(120px, 1fr))`

### 4.4 ProvenanceTree

Visual tree showing asset lineage with expand/collapse.

```tsx
// Full auto-render
<ProvenanceTree assetId={rootId} />

// Compound
<ProvenanceTree assetId={rootId}>
  <ProvenanceTree.Node />
</ProvenanceTree>
```

**Compound components:**

```tsx
ProvenanceTree       // Root container, wraps ProvenanceTreeRoot
ProvenanceTree.Node  // Single tree node (indented, with expand/collapse toggle)
```

**DOM structure (default):**
```
div.provenance-tree
  └── div.provenance-node (recursive, per node)
        ├── button.node-toggle (expand/collapse chevron, hidden for leaves)
        ├── span.node-icon (asset type icon)
        ├── span.node-name (asset name)
        └── div.provenance-node-children (indented, if expanded)
              └── div.provenance-node (recursive)
```

**Behavior:**
- Wraps `<ProvenanceTreeRoot>` headless component
- Indentation: `padding-left: depth * 20px`
- `hasChildren` determines if toggle chevron is shown
- Expanded nodes: chevron rotated 90deg
- Click node name: selects asset
- Click chevron: toggle expand/collapse

### 4.5 Base Atoms

**Button:**
```tsx
<Button variant="primary" size="sm" onClick={...}>Export</Button>
<Button variant="ghost">Cancel</Button>
```

Props: `variant: 'primary' | 'secondary' | 'ghost'`, `size: 'sm' | 'md'`, standard button props.

**IconButton:**
```tsx
<IconButton icon="play" onClick={...} />
<IconButton icon="pause" label="Pause" />
```

Props: `icon: string` (icon name), `label?: string` (aria-label), standard button props.

Icons: inline SVG, minimal set — play, pause, undo, redo, mute, unmute, lock, unlock, chevron-right, chevron-down, zoom-in, zoom-out, export, trash.

**Panel:**
```tsx
<Panel title="Assets" collapsible>
  <AssetLibrary />
</Panel>
```

Props: `title?: string`, `collapsible?: boolean`, `defaultCollapsed?: boolean`.

---

## 5. File Structure

```
packages/react-ui/
├── src/
│   ├── tokens.css                        # CSS custom properties (--pc-*)
│   ├── reset.css                         # Minimal reset for component internals
│   ├── icons.tsx                         # Inline SVG icon components
│   ├── atoms/
│   │   ├── button.tsx                    # Button component
│   │   ├── button.module.css
│   │   ├── icon-button.tsx               # IconButton component
│   │   ├── icon-button.module.css
│   │   ├── panel.tsx                     # Panel component
│   │   ├── panel.module.css
│   │   └── index.ts
│   ├── preview/
│   │   ├── preview.tsx                   # Preview component
│   │   ├── preview.module.css
│   │   └── index.ts
│   ├── timeline/
│   │   ├── timeline.tsx                  # Timeline root + compound
│   │   ├── timeline-toolbar.tsx
│   │   ├── timeline-track-list.tsx
│   │   ├── timeline-track.tsx
│   │   ├── timeline-clip.tsx
│   │   ├── timeline-playhead.tsx
│   │   ├── timeline.module.css
│   │   └── index.ts
│   ├── asset-library/
│   │   ├── asset-library.tsx             # AssetLibrary root + compound
│   │   ├── asset-library-filter.tsx
│   │   ├── asset-library-grid.tsx
│   │   ├── asset-library-item.tsx
│   │   ├── asset-library.module.css
│   │   └── index.ts
│   ├── provenance-tree/
│   │   ├── provenance-tree.tsx           # ProvenanceTree root + compound
│   │   ├── provenance-tree-node.tsx
│   │   ├── provenance-tree.module.css
│   │   └── index.ts
│   └── index.ts                          # Public exports
├── __tests__/
│   ├── atoms/
│   │   └── button.test.tsx
│   ├── preview.test.tsx
│   ├── timeline.test.tsx
│   ├── asset-library.test.tsx
│   └── provenance-tree.test.tsx
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## 6. CSS Module Strategy

### Build Output

tsup bundles CSS Modules into a single `dist/index.css` that consumers import:

```tsx
import '@pneuma-craft/react-ui/styles';    // or
import '@pneuma-craft/react-ui/dist/index.css';
```

Components reference CSS Modules internally:
```tsx
import styles from './preview.module.css';
// <div className={styles.preview}>
```

### Class Name Composition

Consumer `className` is merged with module class:

```tsx
function Preview({ className }: { className?: string }) {
  return <div className={`${styles.preview} ${className ?? ''}`}>...</div>;
}
```

### Token Scoping

`tokens.css` defines all `--pc-*` variables on `:root`. Components reference them in their `.module.css`:

```css
/* preview.module.css */
.preview {
  background: var(--pc-surface);
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius-lg);
}

.controls {
  background: var(--pc-bg);
  padding: var(--pc-space-2) var(--pc-space-3);
}
```

---

## 7. Testing Strategy

Components are tested with `@testing-library/react`:

- **Rendering:** Component renders without errors, correct DOM structure
- **Interaction:** Button clicks, filter selection, play/pause toggle
- **State integration:** Hooks fire correctly (mock via PneumaCraftProvider)
- **Compound API:** Sub-components render correctly when used standalone

CSS is NOT tested — visual regression testing is out of scope for MVP.

---

## 8. Package Configuration

```json
{
  "name": "@pneuma-craft/react-ui",
  "version": "0.1.0",
  "dependencies": {
    "@pneuma-craft/react": "workspace:*",
    "@pneuma-craft/core": "workspace:*",
    "@pneuma-craft/timeline": "workspace:*"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

Dependency direction: `react-ui → react → video → timeline → core`

---

## 9. MVP Scope

**In scope:**
- Design tokens (`tokens.css`) with full `--pc-*` system
- Base atoms: Button, IconButton, Panel
- Icons: inline SVG, minimal set (14 icons)
- Preview: canvas + play/pause/seek controls
- Timeline: multi-track with clips, playhead, zoom toolbar, compound API
- AssetLibrary: filter tabs, grid view, selection, compound API
- ProvenanceTree: expand/collapse tree, compound API
- CSS Modules bundled to `dist/index.css`

**Out of scope (future):**
- Light theme (tokens are ready, just need alternate values)
- Drag-and-drop (clip reorder, asset drop onto timeline)
- Keyboard shortcuts
- Resizable panels
- Context menus
- Transition visualization
- Waveform display
- Thumbnail preview in timeline clips
- Responsive/mobile layout
