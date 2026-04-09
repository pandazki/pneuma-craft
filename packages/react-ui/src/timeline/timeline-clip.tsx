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
