import React from 'react';
import type { Track } from '@pneuma-craft/timeline';
import { TimelineTrack } from './timeline-track.js';

export interface TimelineTrackListProps {
  tracks: readonly Track[];
  duration: number;
  timeToPixels: (time: number) => number;
  pixelsToTime?: (px: number) => number;
  onClipMove?: (clipId: string, newStartTime: number) => void;
  onClipSplit?: (clipId: string, time: number) => void;
}

export function TimelineTrackList({ tracks, duration, timeToPixels, pixelsToTime, onClipMove, onClipSplit }: TimelineTrackListProps) {
  const totalWidth = timeToPixels(duration);
  return (
    <div className="pc-timeline-tracks" style={{ minWidth: `${120 + totalWidth}px` }}>
      {tracks.map((track) => (
        <TimelineTrack
          key={track.id}
          track={track}
          timeToPixels={timeToPixels}
          pixelsToTime={pixelsToTime}
          onClipMove={onClipMove}
          onClipSplit={onClipSplit}
        />
      ))}
    </div>
  );
}
