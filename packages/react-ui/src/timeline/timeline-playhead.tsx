import React from 'react';

export interface TimelinePlayheadProps {
  position: number;
}

export function TimelinePlayhead({ position }: TimelinePlayheadProps) {
  return (
    <div
      className="pc-timeline-playhead"
      style={{ left: `${120 + position}px` }}
    />
  );
}
