import React from 'react';

export interface IconProps {
  size?: number;
  className?: string;
}

export type IconName = 'play' | 'pause' | 'undo' | 'redo' | 'volume' | 'mute' | 'lock' | 'unlock' | 'chevron-right' | 'chevron-down' | 'zoom-in' | 'zoom-out' | 'export' | 'trash';

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

export const iconMap: Record<IconName, React.ComponentType<IconProps>> = {
  play: PlayIcon, pause: PauseIcon,
  undo: UndoIcon, redo: RedoIcon,
  volume: VolumeIcon, mute: MuteIcon,
  lock: LockIcon, unlock: UnlockIcon,
  'chevron-right': ChevronRightIcon, 'chevron-down': ChevronDownIcon,
  'zoom-in': ZoomInIcon, 'zoom-out': ZoomOutIcon,
  export: ExportIcon, trash: TrashIcon,
};
