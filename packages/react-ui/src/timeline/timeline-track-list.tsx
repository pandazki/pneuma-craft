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
