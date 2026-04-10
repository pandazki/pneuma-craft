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
 * Compute preview positions for all clips when `draggedClipId` is placed
 * at `draggedNewStart`. The dragged clip's position is pinned; other clips
 * are pushed forward if they overlap with any earlier clip.
 */
function computeRipplePreview(
  clips: readonly Clip[],
  draggedClipId: string,
  draggedNewStart: number,
): Map<string, number> {
  const result = new Map<string, number>();
  const dragged = clips.find((c) => c.id === draggedClipId);
  if (!dragged) return result;

  // Pin the dragged clip at user's position
  result.set(draggedClipId, draggedNewStart);

  // Collect others sorted by their original startTime
  const others = clips
    .filter((c) => c.id !== draggedClipId)
    .map((c) => ({ id: c.id, start: c.startTime, duration: c.duration }))
    .sort((a, b) => a.start - b.start);

  // Build a "occupied" list: start with the dragged clip's region
  const draggedEnd = draggedNewStart + dragged.duration;

  // For each other clip, check if it overlaps with the dragged clip
  // or with the chain of previously-pushed clips
  for (const c of others) {
    const cEnd = c.start + c.duration;

    // Does this clip overlap with the dragged clip?
    if (c.start < draggedEnd && cEnd > draggedNewStart) {
      // Push it right after the dragged clip (or after the last pushed clip)
      c.start = draggedEnd;
    }

    result.set(c.id, c.start);
  }

  // Now resolve chain overlaps among the non-dragged clips
  // Sort all entries by start time, keeping dragged pinned
  const all = clips
    .map((c) => ({
      id: c.id,
      start: result.get(c.id)!,
      duration: c.duration,
      pinned: c.id === draggedClipId,
    }))
    .sort((a, b) => a.start - b.start);

  for (let i = 1; i < all.length; i++) {
    const prevEnd = all[i - 1].start + all[i - 1].duration;
    if (all[i].start < prevEnd) {
      if (all[i].pinned) {
        // Dragged clip stays, don't move it
        continue;
      }
      all[i].start = prevEnd;
      result.set(all[i].id, all[i].start);
    }
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

  // ── Refs for stable event handler closures ──────────────────────────
  const dragRef = useRef<DragState | null>(null);
  const trackClipsRef = useRef(track.clips);
  trackClipsRef.current = track.clips;
  const pixelsToTimeRef = useRef(pixelsToTime);
  pixelsToTimeRef.current = pixelsToTime;
  const onClipMoveRef = useRef(onClipMove);
  onClipMoveRef.current = onClipMove;

  // Stable DOM order: sort clips by id
  const clipsSortedById = useMemo(
    () => [...track.clips].sort((a, b) => a.id.localeCompare(b.id)),
    [track.clips],
  );

  // ── Drag start ──────────────────────────────────────────────────────
  const handleDragStart = useCallback(
    (clipId: string, mouseX: number) => {
      if (!pixelsToTime || track.locked) return;
      const clip = track.clips.find((c) => c.id === clipId);
      if (!clip) return;

      const initial: DragState = {
        clipId,
        startMouseX: mouseX,
        startClipTime: clip.startTime,
        positions: computeRipplePreview(track.clips, clipId, clip.startTime),
        snapTime: null,
      };
      dragRef.current = initial;
      setDragState(initial);
    },
    [track.clips, track.locked, pixelsToTime],
  );

  // ── Document listeners: bind once on drag start, unbind on end ──────
  useEffect(() => {
    if (!dragState) return;

    const onMouseMove = (ev: MouseEvent) => {
      const ds = dragRef.current;
      const p2t = pixelsToTimeRef.current;
      if (!ds || !p2t) return;

      const deltaX = ev.clientX - ds.startMouseX;
      let newStart = Math.max(0, ds.startClipTime + p2t(deltaX));

      // Snap
      const clips = trackClipsRef.current;
      const draggedClip = clips.find((c) => c.id === ds.clipId);
      if (!draggedClip) return;

      const newEnd = newStart + draggedClip.duration;
      const snapThreshold = p2t(5);
      let snappedTime: number | null = null;

      for (const c of clips) {
        if (c.id === ds.clipId) continue;
        // Snap to other clip's start
        if (Math.abs(newStart - c.startTime) < snapThreshold) {
          newStart = c.startTime;
          snappedTime = c.startTime;
          break;
        }
        if (Math.abs(newStart - (c.startTime + c.duration)) < snapThreshold) {
          newStart = c.startTime + c.duration;
          snappedTime = c.startTime + c.duration;
          break;
        }
        // Snap end to other clip's start/end
        if (Math.abs(newEnd - c.startTime) < snapThreshold) {
          newStart = c.startTime - draggedClip.duration;
          snappedTime = c.startTime;
          break;
        }
        if (Math.abs(newEnd - (c.startTime + c.duration)) < snapThreshold) {
          newStart = c.startTime + c.duration - draggedClip.duration;
          snappedTime = c.startTime + c.duration;
          break;
        }
      }
      // Snap to 0
      if (snappedTime === null && Math.abs(newStart) < snapThreshold) {
        newStart = 0;
        snappedTime = 0;
      }
      newStart = Math.max(0, newStart);

      const positions = computeRipplePreview(clips, ds.clipId, newStart);
      const next: DragState = { ...ds, positions, snapTime: snappedTime };
      dragRef.current = next;
      setDragState(next);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      const ds = dragRef.current;
      if (ds && onClipMoveRef.current) {
        const finalStart = ds.positions.get(ds.clipId);
        const clip = trackClipsRef.current.find((c) => c.id === ds.clipId);
        if (finalStart !== undefined && clip && finalStart !== clip.startTime) {
          onClipMoveRef.current(ds.clipId, finalStart);
        }
      }
      dragRef.current = null;
      setDragState(null);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    // ONLY re-bind when a new drag starts (clipId changes), not on position updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState?.clipId]);

  return (
    <div className="pc-timeline-track">
      <div className="pc-timeline-track-header">
        <span className="pc-timeline-track-name">{track.name}</span>
        <span className="pc-timeline-track-status" title={track.muted ? 'Muted' : 'Audible'}>
          {track.muted ? <MuteIcon size={12} /> : <VolumeIcon size={12} />}
        </span>
        <span className="pc-timeline-track-status" title={track.locked ? 'Locked' : 'Unlocked'}>
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
        {dragState?.snapTime != null && (
          <div
            className="pc-timeline-snap-line"
            style={{ left: `${timeToPixels(dragState.snapTime)}px` }}
          />
        )}
      </div>
    </div>
  );
}
