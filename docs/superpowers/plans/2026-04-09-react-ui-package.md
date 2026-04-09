# @pneuma-craft/react-ui Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement styled React UI components (Preview, Timeline, AssetLibrary, ProvenanceTree) built on the @pneuma-craft/react headless layer, with CSS custom property theming.

**Architecture:** New `packages/react-ui` package. Each component wraps a headless component from `@pneuma-craft/react`, adds CSS via scoped class names (`pc-*` prefix). Compound component pattern for Timeline, AssetLibrary, ProvenanceTree. Design tokens defined as CSS custom properties (`--pc-*`).

**Tech Stack:** React 19, CSS (plain, scoped via `pc-` prefix), tsup, Vitest, @testing-library/react

**Design Spec:** `docs/specs/2026-04-09-react-ui-design.md`

**CSS approach note:** The spec mentions CSS Modules but tsup has limited CSS Module support for libraries. We use plain CSS with `pc-` prefixed class names instead — same scoping effect, simpler build, zero config for consumers. Tokens are CSS custom properties on `:root`.

---

## File Structure

```
packages/react-ui/
├── src/
│   ├── styles/
│   │   ├── tokens.css                    # --pc-* design tokens
│   │   └── reset.css                     # Minimal reset
│   ├── icons.tsx                         # Inline SVG icon components
│   ├── atoms/
│   │   ├── button.tsx
│   │   ├── icon-button.tsx
│   │   ├── panel.tsx
│   │   └── index.ts
│   ├── preview/
│   │   ├── preview.tsx
│   │   ├── preview.css
│   │   └── index.ts
│   ├── timeline/
│   │   ├── timeline.tsx
│   │   ├── timeline-toolbar.tsx
│   │   ├── timeline-track-list.tsx
│   │   ├── timeline-track.tsx
│   │   ├── timeline-clip.tsx
│   │   ├── timeline-playhead.tsx
│   │   ├── timeline.css
│   │   └── index.ts
│   ├── asset-library/
│   │   ├── asset-library.tsx
│   │   ├── asset-library-filter.tsx
│   │   ├── asset-library-grid.tsx
│   │   ├── asset-library-item.tsx
│   │   ├── asset-library.css
│   │   └── index.ts
│   ├── provenance-tree/
│   │   ├── provenance-tree.tsx
│   │   ├── provenance-tree-node.tsx
│   │   ├── provenance-tree.css
│   │   └── index.ts
│   └── index.ts
├── __tests__/
│   ├── helpers.tsx
│   ├── atoms.test.tsx
│   ├── preview.test.tsx
│   ├── timeline.test.tsx
│   ├── asset-library.test.tsx
│   └── provenance-tree.test.tsx
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

---

### Task 1: Package Scaffold + Design Tokens

Create the new package with all config files, design tokens, and reset CSS.

**Files:**
- Create: `packages/react-ui/package.json`
- Create: `packages/react-ui/tsconfig.json`
- Create: `packages/react-ui/tsup.config.ts`
- Create: `packages/react-ui/vitest.config.ts`
- Create: `packages/react-ui/src/styles/tokens.css`
- Create: `packages/react-ui/src/styles/reset.css`
- Create: `packages/react-ui/src/index.ts`
- Modify: root `package.json` (add workspace)
- Modify: root `tsconfig.json` (add reference)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@pneuma-craft/react-ui",
  "version": "0.1.0",
  "description": "Styled React UI components for pneuma-craft",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./styles": "./dist/index.css"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@pneuma-craft/react": "workspace:*",
    "@pneuma-craft/core": "workspace:*",
    "@pneuma-craft/timeline": "workspace:*"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "jsdom": "^26.0.0",
    "tsup": "^8.4.0",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  external: [
    'react',
    'react-dom',
    '@pneuma-craft/core',
    '@pneuma-craft/timeline',
    '@pneuma-craft/react',
  ],
});
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
```

- [ ] **Step 5: Create tokens.css**

```css
/* packages/react-ui/src/styles/tokens.css */
:root {
  /* Backgrounds */
  --pc-bg: #09090b;
  --pc-surface: #18181b;
  --pc-surface-hover: #27272a;
  --pc-surface-active: #3f3f46;

  /* Foreground */
  --pc-fg: #fafafa;
  --pc-fg-muted: #a1a1aa;
  --pc-fg-dim: #71717a;

  /* Accent */
  --pc-primary: #f97316;
  --pc-primary-hover: #fdba74;
  --pc-primary-muted: rgba(249, 115, 22, 0.15);

  /* Borders */
  --pc-border: rgba(255, 255, 255, 0.08);
  --pc-border-hover: rgba(255, 255, 255, 0.15);

  /* Status */
  --pc-success: #4ade80;
  --pc-error: #f87171;
  --pc-warning: #facc15;

  /* Spacing */
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

  /* Track type colors */
  --pc-track-video: #3b82f6;
  --pc-track-audio: #22c55e;
  --pc-track-subtitle: #eab308;
}
```

- [ ] **Step 6: Create reset.css**

```css
/* packages/react-ui/src/styles/reset.css */
[class^="pc-"] {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: var(--pc-font-sans);
  color: var(--pc-fg);
  -webkit-font-smoothing: antialiased;
}

[class^="pc-"] *,
[class^="pc-"] *::before,
[class^="pc-"] *::after {
  box-sizing: border-box;
}

[class^="pc-"] button {
  cursor: pointer;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
}
```

- [ ] **Step 7: Create initial index.ts**

```typescript
// packages/react-ui/src/index.ts
import './styles/tokens.css';
import './styles/reset.css';
```

- [ ] **Step 8: Update root configs**

Add `"packages/react-ui"` to root `tsconfig.json` references.

Run: `bun install` from root.

- [ ] **Step 9: Verify build**

Run: `bun run build`
Expected: All packages build including react-ui.

- [ ] **Step 10: Commit**

```bash
git add packages/react-ui/ package.json tsconfig.json
git commit -m "feat(react-ui): scaffold package with design tokens"
```

---

### Task 2: Icons

Inline SVG icon components for all UI elements.

**Files:**
- Create: `packages/react-ui/src/icons.tsx`

- [ ] **Step 1: Create icon components**

```tsx
// packages/react-ui/src/icons.tsx
import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

function createIcon(path: string, viewBox = '0 0 24 24') {
  return function Icon({ size = 16, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d={path} />
      </svg>
    );
  };
}

// Feather-style icons
export const PlayIcon = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <polygon points="5,3 19,12 5,21" />
  </svg>
);

export const PauseIcon = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

export const UndoIcon = createIcon('M3 10h10a5 5 0 0 1 0 10H9 M3 10l4-4 M3 10l4 4');
export const RedoIcon = createIcon('M21 10H11a5 5 0 0 0 0 10h4 M21 10l-4-4 M21 10l-4 4');

export const VolumeIcon = createIcon('M11 5L6 9H2v6h4l5 4V5z M15.54 8.46a5 5 0 0 1 0 7.07');
export const MuteIcon = createIcon('M11 5L6 9H2v6h4l5 4V5z M23 9l-6 6 M17 9l6 6');

export const LockIcon = createIcon('M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4');
export const UnlockIcon = createIcon('M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 9.9-1');

export const ChevronRightIcon = createIcon('M9 18l6-6-6-6');
export const ChevronDownIcon = createIcon('M6 9l6 6 6-6');

export const ZoomInIcon = createIcon('M11 8v6 M8 11h6 M21 21l-4.35-4.35 M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z');
export const ZoomOutIcon = createIcon('M8 11h6 M21 21l-4.35-4.35 M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z');

export const ExportIcon = createIcon('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3');
export const TrashIcon = createIcon('M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2');
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-ui/src/icons.tsx
git commit -m "feat(react-ui): add inline SVG icon components"
```

---

### Task 3: Button + IconButton Atoms

**Files:**
- Create: `packages/react-ui/src/atoms/button.tsx`
- Create: `packages/react-ui/src/atoms/icon-button.tsx`
- Create: `packages/react-ui/src/atoms/atoms.css`
- Create: `packages/react-ui/src/atoms/index.ts`
- Create: `packages/react-ui/__tests__/helpers.tsx`
- Create: `packages/react-ui/__tests__/atoms.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// packages/react-ui/__tests__/helpers.tsx
import React from 'react';
import { vi } from 'vitest';
import { PneumaCraftProvider } from '@pneuma-craft/react';
import type { AssetResolver } from '@pneuma-craft/video';

export function createMockAssetResolver(): AssetResolver {
  return {
    resolveUrl: vi.fn().mockReturnValue('http://localhost/test.mp4'),
    fetchBlob: vi.fn().mockResolvedValue(new Blob()),
  };
}

export function createTestWrapper() {
  const resolver = createMockAssetResolver();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <PneumaCraftProvider assetResolver={resolver}>
        {children}
      </PneumaCraftProvider>
    );
  };
}
```

```tsx
// packages/react-ui/__tests__/atoms.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Button, IconButton } from '../src/atoms/index.js';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeDefined();
  });

  it('calls onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(onClick).toHaveBeenCalled();
  });

  it('applies variant class', () => {
    const { container } = render(<Button variant="primary">Primary</Button>);
    expect(container.querySelector('.pc-button--primary')).toBeDefined();
  });

  it('merges custom className', () => {
    const { container } = render(<Button className="custom">Test</Button>);
    const btn = container.querySelector('.pc-button');
    expect(btn?.classList.contains('custom')).toBe(true);
  });
});

describe('IconButton', () => {
  it('renders with aria-label', () => {
    render(<IconButton icon="play" label="Play" />);
    expect(screen.getByLabelText('Play')).toBeDefined();
  });

  it('calls onClick', () => {
    const onClick = vi.fn();
    render(<IconButton icon="play" label="Play" onClick={onClick} />);
    fireEvent.click(screen.getByLabelText('Play'));
    expect(onClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/react-ui && bunx vitest run __tests__/atoms.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement atoms**

```css
/* packages/react-ui/src/atoms/atoms.css */
.pc-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--pc-space-2);
  padding: var(--pc-space-2) var(--pc-space-4);
  border-radius: var(--pc-radius-md);
  font-size: var(--pc-font-size-sm);
  font-weight: 500;
  transition: background var(--pc-transition), color var(--pc-transition);
  white-space: nowrap;
}

.pc-button--primary {
  background: var(--pc-primary);
  color: var(--pc-bg);
}
.pc-button--primary:hover {
  background: var(--pc-primary-hover);
}

.pc-button--secondary {
  background: var(--pc-surface);
  border: 1px solid var(--pc-border);
}
.pc-button--secondary:hover {
  background: var(--pc-surface-hover);
  border-color: var(--pc-border-hover);
}

.pc-button--ghost {
  background: transparent;
}
.pc-button--ghost:hover {
  background: var(--pc-surface-hover);
}

.pc-button--sm {
  padding: var(--pc-space-1) var(--pc-space-3);
  font-size: var(--pc-font-size-xs);
}

.pc-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--pc-radius-sm);
  color: var(--pc-fg-muted);
  transition: background var(--pc-transition), color var(--pc-transition);
}
.pc-icon-button:hover {
  background: var(--pc-surface-hover);
  color: var(--pc-fg);
}
```

```tsx
// packages/react-ui/src/atoms/button.tsx
import React from 'react';
import '../styles/tokens.css';
import './atoms.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = [
    'pc-button',
    `pc-button--${variant}`,
    size === 'sm' ? 'pc-button--sm' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
```

```tsx
// packages/react-ui/src/atoms/icon-button.tsx
import React from 'react';
import '../styles/tokens.css';
import './atoms.css';
import {
  PlayIcon, PauseIcon, UndoIcon, RedoIcon,
  VolumeIcon, MuteIcon, LockIcon, UnlockIcon,
  ChevronRightIcon, ChevronDownIcon,
  ZoomInIcon, ZoomOutIcon, ExportIcon, TrashIcon,
} from '../icons.js';

const iconMap: Record<string, React.ComponentType<{ size?: number }>> = {
  play: PlayIcon, pause: PauseIcon,
  undo: UndoIcon, redo: RedoIcon,
  volume: VolumeIcon, mute: MuteIcon,
  lock: LockIcon, unlock: UnlockIcon,
  'chevron-right': ChevronRightIcon, 'chevron-down': ChevronDownIcon,
  'zoom-in': ZoomInIcon, 'zoom-out': ZoomOutIcon,
  export: ExportIcon, trash: TrashIcon,
};

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  label?: string;
  size?: number;
}

export function IconButton({
  icon,
  label,
  size = 16,
  className,
  ...props
}: IconButtonProps) {
  const IconComponent = iconMap[icon];
  return (
    <button
      className={`pc-icon-button ${className ?? ''}`}
      aria-label={label}
      {...props}
    >
      {IconComponent ? <IconComponent size={size} /> : null}
    </button>
  );
}
```

```typescript
// packages/react-ui/src/atoms/index.ts
export { Button } from './button.js';
export type { ButtonProps } from './button.js';
export { IconButton } from './icon-button.js';
export type { IconButtonProps } from './icon-button.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/react-ui && bunx vitest run __tests__/atoms.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react-ui/src/atoms/ packages/react-ui/__tests__/
git commit -m "feat(react-ui): implement Button and IconButton atoms"
```

---

### Task 4: Panel Atom

**Files:**
- Modify: `packages/react-ui/src/atoms/atoms.css`
- Create: `packages/react-ui/src/atoms/panel.tsx`
- Modify: `packages/react-ui/src/atoms/index.ts`

- [ ] **Step 1: Implement Panel**

```css
/* Append to packages/react-ui/src/atoms/atoms.css */

.pc-panel {
  background: var(--pc-surface);
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius-lg);
  overflow: hidden;
}

.pc-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--pc-space-2) var(--pc-space-3);
  border-bottom: 1px solid var(--pc-border);
  font-size: var(--pc-font-size-sm);
  font-weight: 500;
  color: var(--pc-fg-muted);
}

.pc-panel-body {
  padding: var(--pc-space-2);
}

.pc-panel-body--collapsed {
  display: none;
}

.pc-panel-toggle {
  transition: transform var(--pc-transition);
}

.pc-panel-toggle--collapsed {
  transform: rotate(-90deg);
}
```

```tsx
// packages/react-ui/src/atoms/panel.tsx
import React, { useState } from 'react';
import '../styles/tokens.css';
import './atoms.css';
import { ChevronDownIcon } from '../icons.js';

export interface PanelProps {
  title?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function Panel({
  title,
  collapsible = false,
  defaultCollapsed = false,
  className,
  style,
  children,
}: PanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={`pc-panel ${className ?? ''}`} style={style}>
      {title && (
        <div className="pc-panel-header">
          <span>{title}</span>
          {collapsible && (
            <button
              className={`pc-icon-button pc-panel-toggle ${collapsed ? 'pc-panel-toggle--collapsed' : ''}`}
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'Expand' : 'Collapse'}
            >
              <ChevronDownIcon size={14} />
            </button>
          )}
        </div>
      )}
      <div className={`pc-panel-body ${collapsed ? 'pc-panel-body--collapsed' : ''}`}>
        {children}
      </div>
    </div>
  );
}
```

Add to `atoms/index.ts`:
```typescript
export { Panel } from './panel.js';
export type { PanelProps } from './panel.js';
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-ui/src/atoms/
git commit -m "feat(react-ui): implement Panel atom"
```

---

### Task 5: Preview Component

**Files:**
- Create: `packages/react-ui/src/preview/preview.tsx`
- Create: `packages/react-ui/src/preview/preview.css`
- Create: `packages/react-ui/src/preview/index.ts`
- Create: `packages/react-ui/__tests__/preview.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// packages/react-ui/__tests__/preview.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { Preview } from '../src/preview/index.js';
import { createTestWrapper } from './helpers.js';

const Wrapper = createTestWrapper();

describe('Preview', () => {
  it('renders preview container', () => {
    const { container } = render(<Wrapper><Preview /></Wrapper>);
    expect(container.querySelector('.pc-preview')).toBeDefined();
  });

  it('renders canvas element', () => {
    const { container } = render(<Wrapper><Preview /></Wrapper>);
    expect(container.querySelector('canvas')).toBeDefined();
  });

  it('renders playback controls', () => {
    const { container } = render(<Wrapper><Preview /></Wrapper>);
    expect(container.querySelector('.pc-preview-controls')).toBeDefined();
  });

  it('renders play button', () => {
    const { container } = render(<Wrapper><Preview /></Wrapper>);
    expect(container.querySelector('[aria-label="Play"]')).toBeDefined();
  });

  it('renders time display', () => {
    const { container } = render(<Wrapper><Preview /></Wrapper>);
    expect(container.querySelector('.pc-preview-time')).toBeDefined();
  });

  it('renders seekbar', () => {
    const { container } = render(<Wrapper><Preview /></Wrapper>);
    expect(container.querySelector('.pc-preview-seekbar')).toBeDefined();
  });

  it('merges custom className', () => {
    const { container } = render(<Wrapper><Preview className="custom" /></Wrapper>);
    const el = container.querySelector('.pc-preview');
    expect(el?.classList.contains('custom')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/react-ui && bunx vitest run __tests__/preview.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Preview CSS**

```css
/* packages/react-ui/src/preview/preview.css */
.pc-preview {
  display: flex;
  flex-direction: column;
  background: var(--pc-bg);
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius-lg);
  overflow: hidden;
}

.pc-preview-canvas-container {
  position: relative;
  width: 100%;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pc-preview-canvas-container canvas {
  width: 100%;
  height: auto;
  display: block;
}

.pc-preview-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pc-fg-muted);
  font-size: var(--pc-font-size-sm);
}

.pc-preview-controls {
  display: flex;
  align-items: center;
  gap: var(--pc-space-2);
  padding: var(--pc-space-2) var(--pc-space-3);
  background: var(--pc-surface);
  border-top: 1px solid var(--pc-border);
}

.pc-preview-time {
  font-size: var(--pc-font-size-xs);
  font-family: var(--pc-font-mono);
  color: var(--pc-fg-muted);
  min-width: 100px;
  text-align: center;
}

.pc-preview-seekbar {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--pc-surface-active);
  border-radius: var(--pc-radius-full);
  outline: none;
  cursor: pointer;
}

.pc-preview-seekbar::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--pc-primary);
  cursor: pointer;
}
```

- [ ] **Step 4: Implement Preview component**

```tsx
// packages/react-ui/src/preview/preview.tsx
import React, { useCallback } from 'react';
import { PreviewRoot, usePlayback } from '@pneuma-craft/react';
import { IconButton } from '../atoms/index.js';
import '../styles/tokens.css';
import './preview.css';

export interface PreviewProps {
  className?: string;
  style?: React.CSSProperties;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}

function PreviewControls() {
  const { state, currentTime, duration, play, pause, seek } = usePlayback();
  const isPlaying = state === 'playing';

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      seek(parseFloat(e.target.value));
    },
    [seek],
  );

  return (
    <div className="pc-preview-controls">
      <IconButton
        icon={isPlaying ? 'pause' : 'play'}
        label={isPlaying ? 'Pause' : 'Play'}
        onClick={isPlaying ? pause : play}
      />
      <span className="pc-preview-time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <input
        type="range"
        className="pc-preview-seekbar"
        min={0}
        max={duration || 1}
        step={0.01}
        value={currentTime}
        onChange={handleSeek}
      />
    </div>
  );
}

export function Preview({ className, style }: PreviewProps) {
  return (
    <div className={`pc-preview ${className ?? ''}`} style={style}>
      <PreviewRoot>
        {({ canvasRef, isLoading }) => (
          <div className="pc-preview-canvas-container">
            <canvas ref={canvasRef} />
            {isLoading && (
              <div className="pc-preview-loading">Loading...</div>
            )}
          </div>
        )}
      </PreviewRoot>
      <PreviewControls />
    </div>
  );
}
```

```typescript
// packages/react-ui/src/preview/index.ts
export { Preview } from './preview.js';
export type { PreviewProps } from './preview.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/react-ui && bunx vitest run __tests__/preview.test.tsx`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/react-ui/src/preview/ packages/react-ui/__tests__/preview.test.tsx
git commit -m "feat(react-ui): implement Preview component with playback controls"
```

---

### Task 6: Timeline Compound Component

The largest task — Timeline root + all sub-components.

**Files:**
- Create: `packages/react-ui/src/timeline/timeline.css`
- Create: `packages/react-ui/src/timeline/timeline.tsx`
- Create: `packages/react-ui/src/timeline/timeline-toolbar.tsx`
- Create: `packages/react-ui/src/timeline/timeline-track-list.tsx`
- Create: `packages/react-ui/src/timeline/timeline-track.tsx`
- Create: `packages/react-ui/src/timeline/timeline-clip.tsx`
- Create: `packages/react-ui/src/timeline/timeline-playhead.tsx`
- Create: `packages/react-ui/src/timeline/index.ts`
- Create: `packages/react-ui/__tests__/timeline.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// packages/react-ui/__tests__/timeline.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { Timeline } from '../src/timeline/index.js';
import { createTestWrapper } from './helpers.js';

const Wrapper = createTestWrapper();

describe('Timeline', () => {
  it('renders timeline container', () => {
    const { container } = render(<Wrapper><Timeline /></Wrapper>);
    expect(container.querySelector('.pc-timeline')).toBeDefined();
  });

  it('renders toolbar', () => {
    const { container } = render(<Wrapper><Timeline /></Wrapper>);
    expect(container.querySelector('.pc-timeline-toolbar')).toBeDefined();
  });

  it('renders track list', () => {
    const { container } = render(<Wrapper><Timeline /></Wrapper>);
    expect(container.querySelector('.pc-timeline-tracks')).toBeDefined();
  });

  it('renders playhead', () => {
    const { container } = render(<Wrapper><Timeline /></Wrapper>);
    expect(container.querySelector('.pc-timeline-playhead')).toBeDefined();
  });

  it('merges custom className', () => {
    const { container } = render(<Wrapper><Timeline className="custom" /></Wrapper>);
    const el = container.querySelector('.pc-timeline');
    expect(el?.classList.contains('custom')).toBe(true);
  });

  it('renders compound sub-components', () => {
    const { container } = render(
      <Wrapper>
        <Timeline>
          <Timeline.Toolbar />
          <Timeline.TrackList />
          <Timeline.Playhead />
        </Timeline>
      </Wrapper>,
    );
    expect(container.querySelector('.pc-timeline-toolbar')).toBeDefined();
    expect(container.querySelector('.pc-timeline-tracks')).toBeDefined();
    expect(container.querySelector('.pc-timeline-playhead')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/react-ui && bunx vitest run __tests__/timeline.test.tsx`
Expected: FAIL

- [ ] **Step 3: Create timeline CSS**

```css
/* packages/react-ui/src/timeline/timeline.css */
.pc-timeline {
  display: flex;
  flex-direction: column;
  background: var(--pc-surface);
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius-lg);
  overflow: hidden;
  font-size: var(--pc-font-size-sm);
}

/* Toolbar */
.pc-timeline-toolbar {
  display: flex;
  align-items: center;
  gap: var(--pc-space-2);
  padding: var(--pc-space-2) var(--pc-space-3);
  border-bottom: 1px solid var(--pc-border);
}

.pc-timeline-duration {
  font-family: var(--pc-font-mono);
  font-size: var(--pc-font-size-xs);
  color: var(--pc-fg-muted);
}

.pc-timeline-zoom {
  width: 100px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--pc-surface-active);
  border-radius: var(--pc-radius-full);
  outline: none;
}

.pc-timeline-zoom::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--pc-fg-muted);
  cursor: pointer;
}

/* Body */
.pc-timeline-body {
  position: relative;
  overflow-x: auto;
  overflow-y: auto;
  min-height: 120px;
}

/* Tracks */
.pc-timeline-tracks {
  position: relative;
}

.pc-timeline-track {
  display: flex;
  border-bottom: 1px solid var(--pc-border);
  min-height: 40px;
}

.pc-timeline-track-header {
  display: flex;
  align-items: center;
  gap: var(--pc-space-1);
  width: 120px;
  min-width: 120px;
  padding: var(--pc-space-1) var(--pc-space-2);
  background: var(--pc-bg);
  border-right: 1px solid var(--pc-border);
  font-size: var(--pc-font-size-xs);
  color: var(--pc-fg-muted);
}

.pc-timeline-track-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-timeline-track-clips {
  position: relative;
  flex: 1;
  height: 40px;
}

/* Clips */
.pc-timeline-clip {
  position: absolute;
  top: 2px;
  height: calc(100% - 4px);
  border-radius: var(--pc-radius-sm);
  padding: 0 var(--pc-space-1);
  display: flex;
  align-items: center;
  font-size: var(--pc-font-size-xs);
  color: #fff;
  overflow: hidden;
  white-space: nowrap;
  cursor: pointer;
  transition: opacity var(--pc-transition);
}

.pc-timeline-clip:hover {
  opacity: 0.85;
}

.pc-timeline-clip--video {
  background: var(--pc-track-video);
}

.pc-timeline-clip--audio {
  background: var(--pc-track-audio);
}

.pc-timeline-clip--subtitle {
  background: var(--pc-track-subtitle);
  color: var(--pc-bg);
}

/* Playhead */
.pc-timeline-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--pc-primary);
  pointer-events: none;
  z-index: 10;
}

.pc-timeline-playhead::before {
  content: '';
  position: absolute;
  top: 0;
  left: -4px;
  width: 10px;
  height: 10px;
  background: var(--pc-primary);
  clip-path: polygon(0 0, 100% 0, 50% 100%);
}
```

- [ ] **Step 4: Implement Timeline sub-components**

```tsx
// packages/react-ui/src/timeline/timeline-toolbar.tsx
import React, { useCallback } from 'react';

export interface TimelineToolbarProps {
  duration: number;
  pixelsPerSecond: number;
  onZoomChange: (pps: number) => void;
}

export function TimelineToolbar({ duration, pixelsPerSecond, onZoomChange }: TimelineToolbarProps) {
  const handleZoom = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onZoomChange(parseInt(e.target.value)),
    [onZoomChange],
  );

  const m = Math.floor(duration / 60);
  const s = Math.floor(duration % 60);

  return (
    <div className="pc-timeline-toolbar">
      <span className="pc-timeline-duration">{m}:{s.toString().padStart(2, '0')}</span>
      <input
        type="range"
        className="pc-timeline-zoom"
        min={10}
        max={500}
        value={pixelsPerSecond}
        onChange={handleZoom}
        aria-label="Zoom"
      />
    </div>
  );
}
```

```tsx
// packages/react-ui/src/timeline/timeline-clip.tsx
import React from 'react';
import type { Clip, TrackType } from '@pneuma-craft/timeline';

export interface TimelineClipProps {
  clip: Clip;
  trackType: TrackType;
  timeToPixels: (time: number) => number;
}

export function TimelineClip({ clip, trackType, timeToPixels }: TimelineClipProps) {
  const left = timeToPixels(clip.startTime);
  const width = timeToPixels(clip.duration);

  return (
    <div
      className={`pc-timeline-clip pc-timeline-clip--${trackType}`}
      style={{ left: `${left}px`, width: `${width}px` }}
      title={clip.text ?? clip.id}
    >
      {clip.text ?? clip.id.slice(0, 8)}
    </div>
  );
}
```

```tsx
// packages/react-ui/src/timeline/timeline-track.tsx
import React from 'react';
import type { Track } from '@pneuma-craft/timeline';
import { TimelineClip } from './timeline-clip.js';
import { IconButton } from '../atoms/index.js';

export interface TimelineTrackProps {
  track: Track;
  timeToPixels: (time: number) => number;
}

export function TimelineTrack({ track, timeToPixels }: TimelineTrackProps) {
  return (
    <div className="pc-timeline-track">
      <div className="pc-timeline-track-header">
        <span className="pc-timeline-track-name">{track.name}</span>
        <IconButton
          icon={track.muted ? 'mute' : 'volume'}
          label={track.muted ? 'Unmute' : 'Mute'}
          size={12}
        />
        <IconButton
          icon={track.locked ? 'lock' : 'unlock'}
          label={track.locked ? 'Unlock' : 'Lock'}
          size={12}
        />
      </div>
      <div className="pc-timeline-track-clips">
        {track.clips.map((clip) => (
          <TimelineClip
            key={clip.id}
            clip={clip}
            trackType={track.type}
            timeToPixels={timeToPixels}
          />
        ))}
      </div>
    </div>
  );
}
```

```tsx
// packages/react-ui/src/timeline/timeline-track-list.tsx
import React from 'react';
import type { Track } from '@pneuma-craft/timeline';
import { TimelineTrack } from './timeline-track.js';

export interface TimelineTrackListProps {
  tracks: readonly Track[];
  timeToPixels: (time: number) => number;
}

export function TimelineTrackList({ tracks, timeToPixels }: TimelineTrackListProps) {
  return (
    <div className="pc-timeline-tracks">
      {tracks.map((track) => (
        <TimelineTrack key={track.id} track={track} timeToPixels={timeToPixels} />
      ))}
    </div>
  );
}
```

```tsx
// packages/react-ui/src/timeline/timeline-playhead.tsx
import React from 'react';

export interface TimelinePlayheadProps {
  position: number;
}

export function TimelinePlayhead({ position }: TimelinePlayheadProps) {
  return (
    <div
      className="pc-timeline-playhead"
      style={{ left: `${120 + position}px` }}
    />
  );
}
```

- [ ] **Step 5: Implement Timeline root with compound API**

```tsx
// packages/react-ui/src/timeline/timeline.tsx
import React, { useState, createContext, useContext } from 'react';
import { TimelineRoot as HeadlessTimeline } from '@pneuma-craft/react';
import type { TimelineState } from '@pneuma-craft/react';
import { TimelineToolbar } from './timeline-toolbar.js';
import { TimelineTrackList } from './timeline-track-list.js';
import { TimelinePlayhead } from './timeline-playhead.js';
import '../styles/tokens.css';
import './timeline.css';

const TimelineContext = createContext<TimelineState | null>(null);

function useTimelineContext(): TimelineState {
  const ctx = useContext(TimelineContext);
  if (!ctx) throw new Error('Timeline sub-component must be used within <Timeline>');
  return ctx;
}

export interface TimelineProps {
  className?: string;
  style?: React.CSSProperties;
  defaultPixelsPerSecond?: number;
  children?: React.ReactNode;
}

export function Timeline({
  className,
  style,
  defaultPixelsPerSecond = 100,
  children,
}: TimelineProps) {
  const [pixelsPerSecond, setPixelsPerSecond] = useState(defaultPixelsPerSecond);

  return (
    <HeadlessTimeline pixelsPerSecond={pixelsPerSecond}>
      {(state) => (
        <TimelineContext.Provider value={state}>
          <div className={`pc-timeline ${className ?? ''}`} style={style}>
            {children ?? (
              <>
                <CompoundToolbar pps={pixelsPerSecond} onZoomChange={setPixelsPerSecond} />
                <div className="pc-timeline-body">
                  <CompoundTrackList />
                  <CompoundPlayhead />
                </div>
              </>
            )}
          </div>
        </TimelineContext.Provider>
      )}
    </HeadlessTimeline>
  );
}

// Compound sub-components
function CompoundToolbar({ pps, onZoomChange }: { pps?: number; onZoomChange?: (v: number) => void }) {
  const state = useTimelineContext();
  return <TimelineToolbar duration={state.duration} pixelsPerSecond={pps ?? 100} onZoomChange={onZoomChange ?? (() => {})} />;
}

function CompoundTrackList() {
  const state = useTimelineContext();
  return <TimelineTrackList tracks={state.tracks} timeToPixels={state.timeToPixels} />;
}

function CompoundPlayhead() {
  const state = useTimelineContext();
  return <TimelinePlayhead position={state.playheadPosition} />;
}

// Attach compound sub-components
Timeline.Toolbar = CompoundToolbar;
Timeline.TrackList = CompoundTrackList;
Timeline.Playhead = CompoundPlayhead;
```

```typescript
// packages/react-ui/src/timeline/index.ts
export { Timeline } from './timeline.js';
export type { TimelineProps } from './timeline.js';
export { TimelineTrack } from './timeline-track.js';
export type { TimelineTrackProps } from './timeline-track.js';
export { TimelineClip } from './timeline-clip.js';
export type { TimelineClipProps } from './timeline-clip.js';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/react-ui && bunx vitest run __tests__/timeline.test.tsx`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/react-ui/src/timeline/ packages/react-ui/__tests__/timeline.test.tsx
git commit -m "feat(react-ui): implement Timeline compound component"
```

---

### Task 7: AssetLibrary Compound Component

**Files:**
- Create: `packages/react-ui/src/asset-library/asset-library.tsx`
- Create: `packages/react-ui/src/asset-library/asset-library-filter.tsx`
- Create: `packages/react-ui/src/asset-library/asset-library-grid.tsx`
- Create: `packages/react-ui/src/asset-library/asset-library-item.tsx`
- Create: `packages/react-ui/src/asset-library/asset-library.css`
- Create: `packages/react-ui/src/asset-library/index.ts`
- Create: `packages/react-ui/__tests__/asset-library.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// packages/react-ui/__tests__/asset-library.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { AssetLibrary } from '../src/asset-library/index.js';
import { createTestWrapper } from './helpers.js';

const Wrapper = createTestWrapper();

describe('AssetLibrary', () => {
  it('renders asset library container', () => {
    const { container } = render(<Wrapper><AssetLibrary /></Wrapper>);
    expect(container.querySelector('.pc-asset-library')).toBeDefined();
  });

  it('renders filter bar', () => {
    const { container } = render(<Wrapper><AssetLibrary /></Wrapper>);
    expect(container.querySelector('.pc-asset-filter')).toBeDefined();
  });

  it('renders grid', () => {
    const { container } = render(<Wrapper><AssetLibrary /></Wrapper>);
    expect(container.querySelector('.pc-asset-grid')).toBeDefined();
  });

  it('renders compound sub-components', () => {
    const { container } = render(
      <Wrapper>
        <AssetLibrary>
          <AssetLibrary.Filter />
          <AssetLibrary.Grid />
        </AssetLibrary>
      </Wrapper>,
    );
    expect(container.querySelector('.pc-asset-filter')).toBeDefined();
    expect(container.querySelector('.pc-asset-grid')).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement CSS**

```css
/* packages/react-ui/src/asset-library/asset-library.css */
.pc-asset-library {
  display: flex;
  flex-direction: column;
  background: var(--pc-surface);
  border: 1px solid var(--pc-border);
  border-radius: var(--pc-radius-lg);
  overflow: hidden;
}

.pc-asset-filter {
  display: flex;
  gap: var(--pc-space-1);
  padding: var(--pc-space-2) var(--pc-space-3);
  border-bottom: 1px solid var(--pc-border);
}

.pc-asset-filter-tab {
  padding: var(--pc-space-1) var(--pc-space-3);
  border-radius: var(--pc-radius-full);
  font-size: var(--pc-font-size-xs);
  color: var(--pc-fg-muted);
  transition: background var(--pc-transition), color var(--pc-transition);
}

.pc-asset-filter-tab:hover {
  background: var(--pc-surface-hover);
}

.pc-asset-filter-tab--active {
  background: var(--pc-primary-muted);
  color: var(--pc-primary);
}

.pc-asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--pc-space-2);
  padding: var(--pc-space-2);
  overflow-y: auto;
}

.pc-asset-item {
  display: flex;
  flex-direction: column;
  gap: var(--pc-space-1);
  padding: var(--pc-space-2);
  border-radius: var(--pc-radius-md);
  cursor: pointer;
  transition: background var(--pc-transition);
}

.pc-asset-item:hover {
  background: var(--pc-surface-hover);
}

.pc-asset-item--selected {
  background: var(--pc-primary-muted);
}

.pc-asset-item-thumbnail {
  width: 100%;
  aspect-ratio: 16/9;
  background: var(--pc-bg);
  border-radius: var(--pc-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--pc-font-size-xs);
  color: var(--pc-fg-dim);
}

.pc-asset-item-name {
  font-size: var(--pc-font-size-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-asset-item-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--pc-radius-full);
  background: var(--pc-surface-active);
  color: var(--pc-fg-muted);
  text-transform: uppercase;
  width: fit-content;
}
```

- [ ] **Step 3: Implement components**

```tsx
// packages/react-ui/src/asset-library/asset-library-filter.tsx
import React from 'react';
import type { AssetType } from '@pneuma-craft/core';

const FILTER_TABS: Array<{ label: string; type: AssetType | null }> = [
  { label: 'All', type: null },
  { label: 'Video', type: 'video' },
  { label: 'Image', type: 'image' },
  { label: 'Audio', type: 'audio' },
  { label: 'Text', type: 'text' },
];

export interface AssetLibraryFilterProps {
  activeType: AssetType | null;
  onTypeChange: (type: AssetType | null) => void;
}

export function AssetLibraryFilter({ activeType, onTypeChange }: AssetLibraryFilterProps) {
  return (
    <div className="pc-asset-filter">
      {FILTER_TABS.map((tab) => (
        <button
          key={tab.label}
          className={`pc-asset-filter-tab ${activeType === tab.type ? 'pc-asset-filter-tab--active' : ''}`}
          onClick={() => onTypeChange(tab.type)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

```tsx
// packages/react-ui/src/asset-library/asset-library-item.tsx
import React from 'react';
import type { Asset } from '@pneuma-craft/core';

export interface AssetLibraryItemProps {
  asset: Asset;
  selected: boolean;
  onSelect: (assetId: string) => void;
}

export function AssetLibraryItem({ asset, selected, onSelect }: AssetLibraryItemProps) {
  return (
    <div
      className={`pc-asset-item ${selected ? 'pc-asset-item--selected' : ''}`}
      onClick={() => onSelect(asset.id)}
    >
      <div className="pc-asset-item-thumbnail">
        {asset.type.toUpperCase()}
      </div>
      <span className="pc-asset-item-name" title={asset.name}>{asset.name}</span>
      <span className="pc-asset-item-badge">{asset.type}</span>
    </div>
  );
}
```

```tsx
// packages/react-ui/src/asset-library/asset-library-grid.tsx
import React from 'react';
import type { Asset } from '@pneuma-craft/core';
import { AssetLibraryItem } from './asset-library-item.js';

export interface AssetLibraryGridProps {
  assets: readonly Asset[];
  selectedAssetId: string | null;
  onSelect: (assetId: string) => void;
}

export function AssetLibraryGrid({ assets, selectedAssetId, onSelect }: AssetLibraryGridProps) {
  return (
    <div className="pc-asset-grid">
      {assets.map((asset) => (
        <AssetLibraryItem
          key={asset.id}
          asset={asset}
          selected={asset.id === selectedAssetId}
          onSelect={onSelect}
        />
      ))}
      {assets.length === 0 && (
        <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--pc-fg-dim)', padding: 'var(--pc-space-4)', fontSize: 'var(--pc-font-size-sm)' }}>
          No assets
        </div>
      )}
    </div>
  );
}
```

```tsx
// packages/react-ui/src/asset-library/asset-library.tsx
import React, { useState, createContext, useContext } from 'react';
import { AssetLibraryRoot } from '@pneuma-craft/react';
import type { AssetLibraryState } from '@pneuma-craft/react';
import type { AssetType } from '@pneuma-craft/core';
import { AssetLibraryFilter } from './asset-library-filter.js';
import { AssetLibraryGrid } from './asset-library-grid.js';
import '../styles/tokens.css';
import './asset-library.css';

const AssetLibraryContext = createContext<(AssetLibraryState & { filterType: AssetType | null; setFilterType: (t: AssetType | null) => void }) | null>(null);

function useAssetLibraryContext() {
  const ctx = useContext(AssetLibraryContext);
  if (!ctx) throw new Error('AssetLibrary sub-component must be used within <AssetLibrary>');
  return ctx;
}

export interface AssetLibraryProps {
  className?: string;
  style?: React.CSSProperties;
  onAssetSelect?: (assetId: string) => void;
  children?: React.ReactNode;
}

export function AssetLibrary({ className, style, onAssetSelect, children }: AssetLibraryProps) {
  const [filterType, setFilterType] = useState<AssetType | null>(null);

  return (
    <AssetLibraryRoot filter={filterType ? { type: filterType } : undefined} onAssetSelect={onAssetSelect}>
      {(state) => (
        <AssetLibraryContext.Provider value={{ ...state, filterType, setFilterType }}>
          <div className={`pc-asset-library ${className ?? ''}`} style={style}>
            {children ?? (
              <>
                <CompoundFilter />
                <CompoundGrid />
              </>
            )}
          </div>
        </AssetLibraryContext.Provider>
      )}
    </AssetLibraryRoot>
  );
}

function CompoundFilter() {
  const { filterType, setFilterType } = useAssetLibraryContext();
  return <AssetLibraryFilter activeType={filterType} onTypeChange={setFilterType} />;
}

function CompoundGrid() {
  const { assets, selectedAssetId, selectAsset } = useAssetLibraryContext();
  return <AssetLibraryGrid assets={assets} selectedAssetId={selectedAssetId} onSelect={selectAsset} />;
}

AssetLibrary.Filter = CompoundFilter;
AssetLibrary.Grid = CompoundGrid;
```

```typescript
// packages/react-ui/src/asset-library/index.ts
export { AssetLibrary } from './asset-library.js';
export type { AssetLibraryProps } from './asset-library.js';
```

- [ ] **Step 4: Run tests**

Run: `cd packages/react-ui && bunx vitest run __tests__/asset-library.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react-ui/src/asset-library/ packages/react-ui/__tests__/asset-library.test.tsx
git commit -m "feat(react-ui): implement AssetLibrary compound component"
```

---

### Task 8: ProvenanceTree Compound Component

**Files:**
- Create: `packages/react-ui/src/provenance-tree/provenance-tree.tsx`
- Create: `packages/react-ui/src/provenance-tree/provenance-tree-node.tsx`
- Create: `packages/react-ui/src/provenance-tree/provenance-tree.css`
- Create: `packages/react-ui/src/provenance-tree/index.ts`
- Create: `packages/react-ui/__tests__/provenance-tree.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// packages/react-ui/__tests__/provenance-tree.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ProvenanceTree } from '../src/provenance-tree/index.js';
import { createTestWrapper } from './helpers.js';

const Wrapper = createTestWrapper();

describe('ProvenanceTree', () => {
  it('renders tree container', () => {
    const { container } = render(<Wrapper><ProvenanceTree assetId="test" /></Wrapper>);
    expect(container.querySelector('.pc-provenance-tree')).toBeDefined();
  });

  it('renders empty state when no tree', () => {
    const { container } = render(<Wrapper><ProvenanceTree assetId="unknown" /></Wrapper>);
    expect(container.querySelector('.pc-provenance-tree')).toBeDefined();
  });

  it('merges custom className', () => {
    const { container } = render(<Wrapper><ProvenanceTree assetId="test" className="custom" /></Wrapper>);
    const el = container.querySelector('.pc-provenance-tree');
    expect(el?.classList.contains('custom')).toBe(true);
  });
});
```

- [ ] **Step 2: Implement CSS**

```css
/* packages/react-ui/src/provenance-tree/provenance-tree.css */
.pc-provenance-tree {
  font-size: var(--pc-font-size-sm);
  padding: var(--pc-space-2);
}

.pc-provenance-node {
  display: flex;
  flex-direction: column;
}

.pc-provenance-node-row {
  display: flex;
  align-items: center;
  gap: var(--pc-space-1);
  padding: var(--pc-space-1) var(--pc-space-2);
  border-radius: var(--pc-radius-sm);
  cursor: pointer;
  transition: background var(--pc-transition);
}

.pc-provenance-node-row:hover {
  background: var(--pc-surface-hover);
}

.pc-provenance-node-toggle {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--pc-transition);
  color: var(--pc-fg-dim);
}

.pc-provenance-node-toggle--expanded {
  transform: rotate(90deg);
}

.pc-provenance-node-toggle--hidden {
  visibility: hidden;
}

.pc-provenance-node-name {
  color: var(--pc-fg);
}

.pc-provenance-node-type {
  font-size: var(--pc-font-size-xs);
  color: var(--pc-fg-dim);
}

.pc-provenance-node-children {
  /* Indentation handled by inline padding-left */
}

.pc-provenance-empty {
  color: var(--pc-fg-dim);
  font-size: var(--pc-font-size-sm);
  text-align: center;
  padding: var(--pc-space-4);
}
```

- [ ] **Step 3: Implement components**

```tsx
// packages/react-ui/src/provenance-tree/provenance-tree-node.tsx
import React from 'react';
import type { ProvenanceTreeNode as TreeNodeType } from '@pneuma-craft/react';
import { ChevronRightIcon } from '../icons.js';
import { useAsset } from '@pneuma-craft/react';

export interface ProvenanceTreeNodeProps {
  node: TreeNodeType;
  onToggle: (assetId: string) => void;
  onSelect?: (assetId: string) => void;
}

export function ProvenanceTreeNodeView({ node, onToggle, onSelect }: ProvenanceTreeNodeProps) {
  const asset = useAsset(node.assetId);

  return (
    <div className="pc-provenance-node">
      <div
        className="pc-provenance-node-row"
        style={{ paddingLeft: `${node.depth * 20 + 8}px` }}
        onClick={() => onSelect?.(node.assetId)}
      >
        <button
          className={`pc-provenance-node-toggle ${
            node.expanded ? 'pc-provenance-node-toggle--expanded' : ''
          } ${!node.hasChildren ? 'pc-provenance-node-toggle--hidden' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.assetId);
          }}
        >
          <ChevronRightIcon size={12} />
        </button>
        <span className="pc-provenance-node-name">{asset?.name ?? node.assetId}</span>
        {asset && <span className="pc-provenance-node-type">{asset.type}</span>}
      </div>
      {node.expanded && node.children.length > 0 && (
        <div className="pc-provenance-node-children">
          {node.children.map((child) => (
            <ProvenanceTreeNodeView
              key={child.assetId}
              node={child}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

```tsx
// packages/react-ui/src/provenance-tree/provenance-tree.tsx
import React, { createContext, useContext } from 'react';
import { ProvenanceTreeRoot } from '@pneuma-craft/react';
import type { ProvenanceTreeState } from '@pneuma-craft/react';
import { ProvenanceTreeNodeView } from './provenance-tree-node.js';
import '../styles/tokens.css';
import './provenance-tree.css';

const ProvenanceTreeContext = createContext<ProvenanceTreeState | null>(null);

export interface ProvenanceTreeProps {
  assetId: string;
  className?: string;
  style?: React.CSSProperties;
  onAssetSelect?: (assetId: string) => void;
  children?: React.ReactNode;
}

export function ProvenanceTree({ assetId, className, style, onAssetSelect, children }: ProvenanceTreeProps) {
  return (
    <ProvenanceTreeRoot assetId={assetId}>
      {(state) => (
        <ProvenanceTreeContext.Provider value={state}>
          <div className={`pc-provenance-tree ${className ?? ''}`} style={style}>
            {children ?? (
              state.tree ? (
                <ProvenanceTreeNodeView
                  node={state.tree}
                  onToggle={state.toggleNode}
                  onSelect={onAssetSelect}
                />
              ) : (
                <div className="pc-provenance-empty">No provenance data</div>
              )
            )}
          </div>
        </ProvenanceTreeContext.Provider>
      )}
    </ProvenanceTreeRoot>
  );
}

function CompoundNode() {
  const ctx = useContext(ProvenanceTreeContext);
  if (!ctx || !ctx.tree) return null;
  return <ProvenanceTreeNodeView node={ctx.tree} onToggle={ctx.toggleNode} />;
}

ProvenanceTree.Node = CompoundNode;
```

```typescript
// packages/react-ui/src/provenance-tree/index.ts
export { ProvenanceTree } from './provenance-tree.js';
export type { ProvenanceTreeProps } from './provenance-tree.js';
```

- [ ] **Step 4: Run tests**

Run: `cd packages/react-ui && bunx vitest run __tests__/provenance-tree.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react-ui/src/provenance-tree/ packages/react-ui/__tests__/provenance-tree.test.tsx
git commit -m "feat(react-ui): implement ProvenanceTree compound component"
```

---

### Task 9: Public API + Build + README

**Files:**
- Rewrite: `packages/react-ui/src/index.ts`
- Modify: `README.md`

- [ ] **Step 1: Update index.ts**

```typescript
// packages/react-ui/src/index.ts
import './styles/tokens.css';
import './styles/reset.css';

// ── Atoms ──────────────────────────────────────────────────────────────
export { Button, IconButton, Panel } from './atoms/index.js';
export type { ButtonProps, IconButtonProps, PanelProps } from './atoms/index.js';

// ── Icons ──────────────────────────────────────────────────────────────
export * from './icons.js';

// ── Preview ────────────────────────────────────────────────────────────
export { Preview } from './preview/index.js';
export type { PreviewProps } from './preview/index.js';

// ── Timeline ───────────────────────────────────────────────────────────
export { Timeline } from './timeline/index.js';
export type { TimelineProps } from './timeline/index.js';
export { TimelineTrack, TimelineClip } from './timeline/index.js';
export type { TimelineTrackProps, TimelineClipProps } from './timeline/index.js';

// ── Asset Library ──────────────────────────────────────────────────────
export { AssetLibrary } from './asset-library/index.js';
export type { AssetLibraryProps } from './asset-library/index.js';

// ── Provenance Tree ────────────────────────────────────────────────────
export { ProvenanceTree } from './provenance-tree/index.js';
export type { ProvenanceTreeProps } from './provenance-tree/index.js';
```

- [ ] **Step 2: Run all tests**

Run: `cd packages/react-ui && bunx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Build the package**

Run: `bun run build`
Expected: All packages build including react-ui

- [ ] **Step 4: Update README status table**

Add a new row after the react row:
```markdown
| `@pneuma-craft/react-ui` | **Implemented** | Styled components — Preview, Timeline, AssetLibrary, ProvenanceTree |
```

- [ ] **Step 5: Commit**

```bash
git add packages/react-ui/src/index.ts README.md
git commit -m "feat(react-ui): wire up public API exports + update README"
```
