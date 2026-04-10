# @pneuma-craft/react-ui

Styled UI components for pneuma-craft — Preview, Timeline, AssetLibrary, ProvenanceTree, and atomic building blocks. Built with plain CSS using `pc-` prefix naming. Requires `@pneuma-craft/react` Provider.

## Setup

```tsx
import { PneumaCraftProvider } from '@pneuma-craft/react';
import { Preview, Timeline, AssetLibrary, ProvenanceTree } from '@pneuma-craft/react-ui';
import '@pneuma-craft/react-ui/dist/index.css';
```

The CSS file must be imported for styles to work. All components must be rendered inside a `PneumaCraftProvider`.

## Design Tokens

All visual properties are controlled via CSS custom properties on `:root`. Override them to theme the entire library:

| Token | Default | Description |
|-------|---------|-------------|
| `--pc-bg` | `#09090b` | Page background |
| `--pc-surface` | `#18181b` | Panel/card background |
| `--pc-surface-hover` | `#27272a` | Hover state |
| `--pc-surface-active` | `#3f3f46` | Active/pressed state |
| `--pc-fg` | `#fafafa` | Primary text |
| `--pc-fg-muted` | `#a1a1aa` | Secondary text |
| `--pc-fg-dim` | `#71717a` | Tertiary text |
| `--pc-primary` | `#f97316` | Accent color (orange) |
| `--pc-primary-hover` | `#fdba74` | Accent hover |
| `--pc-primary-muted` | `rgba(249,115,22,0.15)` | Accent background |
| `--pc-border` | `rgba(255,255,255,0.08)` | Border color |
| `--pc-success` | `#4ade80` | Success state |
| `--pc-error` | `#f87171` | Error state |
| `--pc-warning` | `#facc15` | Warning state |
| `--pc-radius-sm/md/lg` | `4/8/12px` | Border radius |
| `--pc-font-sans` | `"DM Sans", system-ui, ...` | Body font |
| `--pc-font-mono` | `ui-monospace, ...` | Mono font |
| `--pc-track-video` | `#3b82f6` | Video track color |
| `--pc-track-audio` | `#22c55e` | Audio track color |
| `--pc-track-subtitle` | `#eab308` | Subtitle track color |

### Theming Example

```css
:root {
  --pc-primary: #6366f1;      /* indigo accent instead of orange */
  --pc-bg: #0f172a;           /* slate background */
  --pc-surface: #1e293b;
}
```

## Atoms

### Button

```tsx
<Button variant="primary" size="md" onClick={handleClick}>Export</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost" size="sm">Details</Button>
```

| Prop | Type | Default |
|------|------|---------|
| `variant` | `'primary' \| 'secondary' \| 'ghost'` | `'secondary'` |
| `size` | `'sm' \| 'md'` | `'md'` |
| ...rest | `ButtonHTMLAttributes` | |

### IconButton

```tsx
<IconButton icon="play" label="Play" onClick={play} />
<IconButton icon="undo" label="Undo" size={20} />
```

Available icons: `play`, `pause`, `undo`, `redo`, `volume`, `mute`, `lock`, `unlock`, `chevron-right`, `chevron-down`, `zoom-in`, `zoom-out`, `export`, `trash`

| Prop | Type | Default |
|------|------|---------|
| `icon` | `IconName` | required |
| `label` | `string` | |
| `size` | `number` | `16` |
| ...rest | `ButtonHTMLAttributes` | |

### Panel

```tsx
<Panel title="Assets" collapsible defaultCollapsed={false}>
  <AssetLibrary />
</Panel>
```

| Prop | Type | Default |
|------|------|---------|
| `title` | `string` | |
| `collapsible` | `boolean` | `false` |
| `defaultCollapsed` | `boolean` | `false` |
| `className` | `string` | |
| `style` | `CSSProperties` | |

## Components

### Preview

Canvas-based video preview with play/pause button and seek bar.

```tsx
<Preview className="my-preview" />
```

| Prop | Type |
|------|------|
| `className` | `string?` |
| `style` | `CSSProperties?` |

Reads playback state from the Provider. Renders frames from the `PlaybackEngine` onto a `<canvas>`.

### Timeline

Compound component for track/clip editing. Includes toolbar (zoom, duration), tracks, clips, playhead, and ruler.

```tsx
<Timeline
  defaultPixelsPerSecond={100}
  onSeek={(time) => console.log('seek', time)}
  onClipMove={(clipId, newStartTime) => dispatch('human', { type: 'composition:move-clip', clipId, startTime: newStartTime })}
  onClipSplit={(clipId, time) => dispatch('human', { type: 'composition:split-clip', clipId, time })}
  onClipSelect={(clipId) => console.log('selected', clipId)}
  onAssetDrop={(assetId, time) => { /* add clip at time */ }}
  onClipDragStart={() => { /* save state for undo */ }}
  selectedClipIds={['clip-1']}
  toolbarExtra={<Button size="sm">Custom</Button>}
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `defaultPixelsPerSecond` | `number?` | Initial zoom level |
| `onSeek` | `(time: number) => void` | Ruler/playhead click |
| `onClipMove` | `(clipId, newStartTime) => void` | After drag-to-move |
| `onClipSplit` | `(clipId, time) => void` | Right-click split |
| `onClipSelect` | `(clipId) => void` | Clip click |
| `onAssetDrop` | `(assetId, time) => void` | Asset dropped onto timeline |
| `onClipDragStart` | `() => void` | Drag begins |
| `selectedClipIds` | `string[]?` | Controlled selection |
| `toolbarExtra` | `ReactNode?` | Extra toolbar content |

#### Timeline Interactions

- **Drag to move** — drag clips horizontally to reposition; shows realtime ripple preview
- **Snap** — clips snap to other clip edges and the playhead during drag
- **Right-click split** — right-click a clip to split at the pointer position
- **Click seek** — click the ruler or playhead area to seek
- **Scrub** — drag on the ruler to scrub through time
- **Zoom** — toolbar buttons adjust `pixelsPerSecond`

#### Sub-components

`TimelineTrack` and `TimelineClip` are exported for custom composition, but the default `<Timeline>` renders them automatically from the composition state.

### AssetLibrary

Compound component with type filter and draggable grid.

```tsx
<AssetLibrary
  onAssetSelect={(assetId) => console.log('selected', assetId)}
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `onAssetSelect` | `(assetId: string) => void` | Asset click |
| `className` | `string?` | |
| `style` | `CSSProperties?` | |

Items are draggable — drag an asset from the library onto the Timeline to add a clip.

### ProvenanceTree

Visualizes the provenance DAG for a given asset, with expand/collapse.

```tsx
<ProvenanceTree
  assetId={selectedAssetId}
  onAssetSelect={(id) => console.log('navigate to', id)}
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `assetId` | `string` | Root asset to display tree for |
| `onAssetSelect` | `(assetId: string) => void` | Node click |
| `className` | `string?` | |
| `style` | `CSSProperties?` | |

## CSS Customization

All components use plain CSS with the `pc-` prefix. No CSS-in-JS, no Tailwind dependency.

### Class naming

```
pc-button
pc-button--primary
pc-button--sm
pc-icon-button
pc-panel
pc-preview
pc-timeline
pc-timeline-track
pc-timeline-clip
pc-timeline-clip--selected
pc-asset-library
pc-provenance-tree
```

### Overriding styles

Target the `pc-*` classes directly:

```css
.pc-timeline-clip--selected {
  outline: 2px solid var(--pc-primary);
}

.pc-button--primary {
  background: var(--pc-primary);
}
```

Or wrap in a container class for scoped overrides:

```css
.my-editor .pc-panel {
  border-radius: 0;
}
```

## Utility

### `formatTime(seconds: number): string`

Formats seconds into `M:SS.t` display (e.g., `1:05.3`). Exported for use in custom UIs.
