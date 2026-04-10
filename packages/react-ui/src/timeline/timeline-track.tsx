import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { Track, Clip } from '@pneuma-craft/timeline';
import { TimelineClip } from './timeline-clip.js';
import { MuteIcon, VolumeIcon, LockIcon, UnlockIcon } from '../icons.js';

export interface TimelineTrackProps {
  track: Track;
  timeToPixels: (time: number) => number;
  pixelsToTime?: (px: number) => number;
  onClipMove?: (clipId: string, newStartTime: number) => void;
  onClipSplit?: (clipId: string, time: number) => void;
}

interface DragState {
  clipId: string;
  startMouseX: number;
  startClipTime: number;
  positions: Map<string, number>;
  snapTime: number | null;
}

/**
 * Compute preview positions for all clips, resolving overlaps by
 * pushing later clips forward (ripple effect).
 */
export function computeRipplePreview(
  clips: readonly Clip[],
  draggedClipId: string,
  draggedNewStart: number,
): Map<string, number> {
  const result = new Map<string, number>();

  // Build sorted list with the dragged clip at its new position
  const projected = clips.map((c) => ({
    id: c.id,
    start: c.id === draggedClipId ? draggedNewStart : c.startTime,
    duration: c.duration,
  }));
  projected.sort((a, b) => a.start - b.start);

  // Walk through and resolve overlaps: push later clips forward
  for (let i = 0; i < projected.length; i++) {
    if (i > 0) {
      const prevEnd = projected[i - 1].start + projected[i - 1].duration;
      if (projected[i].start < prevEnd) {
        projected[i].start = prevEnd;
      }
    }
    result.set(projected[i].id, projected[i].start);
  }

  return result;
}

export function TimelineTrack({
  track,
  timeToPixels,
  pixelsToTime,
  onClipMove,
  onClipSplit,
}: TimelineTrackProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const rafRef = useRef<number>(0);

  // Stable DOM order: sort clips by id to prevent React from reordering DOM nodes.
  // This ensures CSS transitions on `left` work reliably for rippled clips.
  const clipsSortedById = useMemo(
    () => [...track.clips].sort((a, b) => a.id.localeCompare(b.id)),
    [track.clips],
  );

  // Snap targets: all clip edges + time 0 (excluding the dragged clip)
  const snapTargetsFor = useCallback(
    (draggedClipId: string) => {
      const targets: number[] = [0];
      for (const clip of track.clips) {
        if (clip.id === draggedClipId) continue;
        targets.push(clip.startTime);
        targets.push(clip.startTime + clip.duration);
      }
      return targets;
    },
    [track.clips],
  );

  const handleDragStart = useCallback(
    (clipId: string, mouseX: number) => {
      if (!pixelsToTime) return;
      if (track.locked) return;
      const clip = track.clips.find((c) => c.id === clipId);
      if (!clip) return;

      const initialPositions = computeRipplePreview(track.clips, clipId, clip.startTime);
      setDragState({
        clipId,
        startMouseX: mouseX,
        startClipTime: clip.startTime,
        positions: initialPositions,
        snapTime: null,
      });
    },
    [track.clips, track.locked, pixelsToTime],
  );

  // Document-level mousemove/mouseup during drag
  useEffect(() => {
    if (!dragState || !pixelsToTime) return;

    const onMouseMove = (ev: MouseEvent) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const deltaX = ev.clientX - dragState.startMouseX;
        const deltaTime = pixelsToTime(deltaX);
        let newStart = Math.max(0, dragState.startClipTime + deltaTime);

        // Snap logic
        const draggedClip = track.clips.find((c) => c.id === dragState.clipId);
        if (!draggedClip) return;
        const newEnd = newStart + draggedClip.duration;
        const targets = snapTargetsFor(dragState.clipId);
        const snapThresholdTime = pixelsToTime(5);
        let snappedTime: number | null = null;

        for (const target of targets) {
          if (Math.abs(newStart - target) < snapThresholdTime) {
            newStart = target;
            snappedTime = target;
            break;
          }
          if (Math.abs(newEnd - target) < snapThresholdTime) {
            newStart = target - draggedClip.duration;
            snappedTime = target;
            break;
          }
        }

        // Clamp again after snap
        newStart = Math.max(0, newStart);

        const positions = computeRipplePreview(track.clips, dragState.clipId, newStart);
        setDragState((prev) =>
          prev ? { ...prev, positions, snapTime: snappedTime } : null,
        );
      });
    };

    const onMouseUp = () => {
      cancelAnimationFrame(rafRef.current);
      if (dragState && onClipMove) {
        const finalStart = dragState.positions.get(dragState.clipId);
        const clip = track.clips.find((c) => c.id === dragState.clipId);
        if (finalStart !== undefined && clip && finalStart !== clip.startTime) {
          onClipMove(dragState.clipId, finalStart);
        }
      }
      setDragState(null);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragState, pixelsToTime, track.clips, snapTargetsFor, onClipMove]);

  return (
    <div className="pc-timeline-track">
      <div className="pc-timeline-track-header">
        <span className="pc-timeline-track-name">{track.name}</span>
        <span
          className="pc-timeline-track-status"
          title={track.muted ? 'Muted' : 'Audible'}
        >
          {track.muted ? <MuteIcon size={12} /> : <VolumeIcon size={12} />}
        </span>
        <span
          className="pc-timeline-track-status"
          title={track.locked ? 'Locked' : 'Unlocked'}
        >
          {track.locked ? <LockIcon size={12} /> : <UnlockIcon size={12} />}
        </span>
      </div>
      <div className="pc-timeline-track-clips">
        {clipsSortedById.map((clip) => {
          const previewStart = dragState?.positions.get(clip.id);
          const displayLeft = timeToPixels(
            previewStart !== undefined ? previewStart : clip.startTime,
          );
          return (
            <TimelineClip
              key={clip.id}
              clip={clip}
              trackType={track.type}
              displayLeft={displayLeft}
              timeToPixels={timeToPixels}
              pixelsToTime={pixelsToTime}
              isDragging={dragState?.clipId === clip.id}
              onDragStart={handleDragStart}
              onSplit={onClipSplit}
            />
          );
        })}
        {dragState?.snapTime !== null && dragState?.snapTime !== undefined && (
          <div
            className="pc-timeline-snap-line"
            style={{ left: `${timeToPixels(dragState.snapTime)}px` }}
          />
        )}
      </div>
    </div>
  );
}
