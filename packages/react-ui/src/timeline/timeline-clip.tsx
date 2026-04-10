import React, { useState, useRef, useCallback } from 'react';
import type { Clip, TrackType } from '@pneuma-craft/timeline';

export interface TimelineClipProps {
  clip: Clip;
  trackType: TrackType;
  timeToPixels: (time: number) => number;
  pixelsToTime?: (px: number) => number;
  snapTargets?: number[];
  onMove?: (clipId: string, newStartTime: number) => void;
  onSplit?: (clipId: string, time: number) => void;
}

export function TimelineClip({
  clip,
  trackType,
  timeToPixels,
  pixelsToTime,
  snapTargets = [],
  onMove,
  onSplit,
}: TimelineClipProps) {
  const left = timeToPixels(clip.startTime);
  const width = timeToPixels(clip.duration);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [snapTime, setSnapTime] = useState<number | null>(null);
  const dragRef = useRef({ mouseX: 0, originalLeft: 0, currentOffset: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // left click only
      if (!pixelsToTime || !onMove) return;
      e.preventDefault();
      e.stopPropagation(); // prevent timeline body click-to-seek

      dragRef.current = { mouseX: e.clientX, originalLeft: left, currentOffset: 0 };
      setDragging(true);

      const onMouseMove = (ev: MouseEvent) => {
        const deltaX = ev.clientX - dragRef.current.mouseX;
        let newLeft = dragRef.current.originalLeft + deltaX;

        // Prevent dragging before time 0
        if (newLeft < 0) newLeft = 0;

        // Snap logic
        const newStartTime = pixelsToTime(newLeft);
        const newEndTime = newStartTime + clip.duration;
        const snapThreshold = pixelsToTime(5); // 5px threshold
        let snappedTime: number | null = null;

        for (const target of snapTargets) {
          if (Math.abs(newStartTime - target) < snapThreshold) {
            newLeft = timeToPixels(target);
            snappedTime = target;
            break;
          }
          if (Math.abs(newEndTime - target) < snapThreshold) {
            newLeft = timeToPixels(target - clip.duration);
            snappedTime = target;
            break;
          }
        }

        const offset = newLeft - left;
        dragRef.current.currentOffset = offset;
        setDragOffset(offset);
        setSnapTime(snappedTime);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        const finalOffset = dragRef.current.currentOffset;
        if (finalOffset !== 0) {
          const newStartTime = pixelsToTime(left + finalOffset);
          onMove(clip.id, Math.max(0, newStartTime));
        }
        setDragging(false);
        setDragOffset(0);
        setSnapTime(null);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [clip, left, pixelsToTime, timeToPixels, snapTargets, onMove],
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

  const handleAltClick = useCallback(
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

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.altKey) {
        handleAltClick(e);
      }
    },
    [handleAltClick],
  );

  const clipStyle: React.CSSProperties = {
    left: `${left + dragOffset}px`,
    width: `${width}px`,
  };

  const className = [
    'pc-timeline-clip',
    `pc-timeline-clip--${trackType}`,
    dragging ? 'pc-timeline-clip--dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
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
      {dragging && snapTime !== null && (
        <div
          className="pc-timeline-snap-line"
          style={{ left: `${timeToPixels(snapTime)}px` }}
        />
      )}
    </>
  );
}
