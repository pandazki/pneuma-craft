import React from 'react';
import type { Track } from '@pneuma-craft/timeline';
import { TimelineTrack } from './timeline-track.js';

export interface TimelineTrackListProps {
  tracks: readonly Track[];
  duration: number;
  timeToPixels: (time: number) => number;
}

export function TimelineTrackList({ tracks, duration, timeToPixels }: TimelineTrackListProps) {
  const totalWidth = timeToPixels(duration);
  return (
    <div className="pc-timeline-tracks" style={{ minWidth: `${120 + totalWidth}px` }}>
      {tracks.map((track) => (
        <TimelineTrack key={track.id} track={track} timeToPixels={timeToPixels} />
      ))}
    </div>
  );
}
