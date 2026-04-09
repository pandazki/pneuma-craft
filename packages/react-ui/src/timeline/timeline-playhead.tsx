import React from 'react';

export interface TimelinePlayheadProps {
  position: number;
  timeToPixels: (time: number) => number;
}

export function TimelinePlayhead({ position, timeToPixels }: TimelinePlayheadProps) {
  return (
    <div
      className="pc-timeline-playhead"
      style={{ left: `${120 + timeToPixels(position)}px` }}
    />
  );
}
