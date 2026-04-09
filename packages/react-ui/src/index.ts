// ── Styles (extracted to dist/index.css by tsup, not emitted in JS) ──
import './styles/tokens.css';
import './styles/reset.css';
import './atoms/atoms.css';

// ── Icons ─────────────────────────────────────────────────────────────
export {
  PlayIcon, PauseIcon, UndoIcon, RedoIcon,
  VolumeIcon, MuteIcon, LockIcon, UnlockIcon,
  ChevronRightIcon, ChevronDownIcon,
  ZoomInIcon, ZoomOutIcon, ExportIcon, TrashIcon,
  iconMap,
} from './icons.js';
export type { IconProps, IconName } from './icons.js';

// ── Atoms ─────────────────────────────────────────────────────────────
export { Button, IconButton, Panel } from './atoms/index.js';
export type { ButtonProps, IconButtonProps, PanelProps } from './atoms/index.js';

// ── Preview ───────────────────────────────────────────────────────────
export { Preview, formatTime } from './preview/index.js';
export type { PreviewProps } from './preview/index.js';

// ── Timeline ──────────────────────────────────────────────────────────
export { Timeline, TimelineTrack, TimelineClip } from './timeline/index.js';
export type { TimelineProps, TimelineTrackProps, TimelineClipProps } from './timeline/index.js';

// ── Asset Library ─────────────────────────────────────────────────────
export { AssetLibrary } from './asset-library/index.js';
export type { AssetLibraryProps } from './asset-library/index.js';

// ── Provenance Tree ───────────────────────────────────────────────────
export { ProvenanceTree } from './provenance-tree/index.js';
export type { ProvenanceTreeProps } from './provenance-tree/index.js';
