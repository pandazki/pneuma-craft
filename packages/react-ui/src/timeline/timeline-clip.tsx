import React, { useCallback } from 'react';
import type { Clip, TrackType } from '@pneuma-craft/timeline';

export interface TimelineClipProps {
  clip: Clip;
  trackType: TrackType;
  displayLeft: number;
  timeToPixels: (time: number) => number;
  pixelsToTime?: (px: number) => number;
  isDragging?: boolean;
  onDragStart?: (clipId: string, mouseX: number) => void;
  onSplit?: (clipId: string, time: number) => void;
}

export function TimelineClip({
  clip,
  trackType,
  displayLeft,
  timeToPixels,
  pixelsToTime,
  isDragging = false,
  onDragStart,
  onSplit,
}: TimelineClipProps) {
  const width = timeToPixels(clip.duration);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if (e.altKey) return; // alt+click is for split
      if (!onDragStart) return;
      e.preventDefault();
      e.stopPropagation();
      onDragStart(clip.id, e.clientX);
    },
    [clip.id, onDragStart],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!onSplit || !pixelsToTime) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const splitTime = clip.startTime + pixelsToTime(clickX);
      onSplit(clip.id, splitTime);
    },
    [clip, pixelsToTime, onSplit],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!e.altKey || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (!onSplit || !pixelsToTime) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const splitTime = clip.startTime + pixelsToTime(clickX);
      onSplit(clip.id, splitTime);
    },
    [clip, pixelsToTime, onSplit],
  );

  const clipStyle: React.CSSProperties = {
    left: `${displayLeft}px`,
    width: `${width}px`,
  };

  const className = [
    'pc-timeline-clip',
    `pc-timeline-clip--${trackType}`,
    isDragging ? 'pc-timeline-clip--dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      style={clipStyle}
      title={clip.text ?? clip.id}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
    >
      {clip.text ?? clip.id.slice(0, 8)}
    </div>
  );
}
