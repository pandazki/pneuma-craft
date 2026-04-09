import React, { useEffect, useRef } from 'react';
import type { PlaybackState } from '@pneuma-craft/video';
import { usePneumaCraftStore } from '../context.js';

export interface PreviewState {
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  readonly isLoading: boolean;
  readonly isReady: boolean;
}

export interface PreviewRootProps {
  children: (state: PreviewState) => React.ReactNode;
}

export function PreviewRoot({ children }: PreviewRootProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playbackState = usePneumaCraftStore((s) => s.playbackState);
  const composition = usePneumaCraftStore((s) => s.composition);
  const subscribeToFrames = usePneumaCraftStore((s) => s.subscribeToFrames);

  const isLoading = playbackState === 'loading';
  const isReady = composition !== null && (playbackState === 'ready' || playbackState === 'playing' || playbackState === 'paused');

  useEffect(() => {
    const unsub = subscribeToFrames((frame) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(frame.image, 0, 0, canvas.width, canvas.height);
    });
    return unsub;
  }, [subscribeToFrames]);

  return <>{children({ canvasRef, isLoading, isReady })}</>;
}
