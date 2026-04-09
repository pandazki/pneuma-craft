import React, { useCallback, useMemo } from 'react';
import type { Track } from '@pneuma-craft/timeline';
import { usePneumaCraftStore } from '../context.js';

export interface TimelineState {
  readonly tracks: Track[];
  readonly duration: number;
  readonly playheadPosition: number;
  readonly timeToPixels: (time: number) => number;
  readonly pixelsToTime: (pixels: number) => number;
}

export interface TimelineRootProps {
  pixelsPerSecond?: number;
  children: (state: TimelineState) => React.ReactNode;
}

export function TimelineRoot({ pixelsPerSecond = 100, children }: TimelineRootProps) {
  const composition = usePneumaCraftStore((s) => s.composition);
  const currentTime = usePneumaCraftStore((s) => s.currentTime);

  const tracks = useMemo(() => composition?.tracks ?? [], [composition]);
  const duration = composition?.duration ?? 0;

  const timeToPixels = useCallback(
    (time: number) => time * pixelsPerSecond,
    [pixelsPerSecond],
  );

  const pixelsToTime = useCallback(
    (pixels: number) => pixels / pixelsPerSecond,
    [pixelsPerSecond],
  );

  return (
    <>
      {children({
        tracks,
        duration,
        playheadPosition: currentTime,
        timeToPixels,
        pixelsToTime,
      })}
    </>
  );
}
