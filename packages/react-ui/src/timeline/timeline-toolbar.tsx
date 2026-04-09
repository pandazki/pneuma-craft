import React, { useCallback } from 'react';

export interface TimelineToolbarProps {
  duration: number;
  pixelsPerSecond: number;
  onZoomChange: (pps: number) => void;
}

export function TimelineToolbar({ duration, pixelsPerSecond, onZoomChange }: TimelineToolbarProps) {
  const handleZoom = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onZoomChange(parseInt(e.target.value)),
    [onZoomChange],
  );

  const m = Math.floor(duration / 60);
  const s = Math.floor(duration % 60);

  return (
    <div className="pc-timeline-toolbar">
      <span className="pc-timeline-duration">{m}:{s.toString().padStart(2, '0')}</span>
      <input
        type="range"
        className="pc-timeline-zoom"
        min={10}
        max={500}
        value={pixelsPerSecond}
        onChange={handleZoom}
        aria-label="Zoom"
      />
    </div>
  );
}
