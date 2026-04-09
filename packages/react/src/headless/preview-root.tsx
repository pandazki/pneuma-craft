import React, { useRef } from 'react';
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

  const isLoading = playbackState === 'loading';
  const isReady = composition !== null && (playbackState === 'ready' || playbackState === 'playing' || playbackState === 'paused');

  return <>{children({ canvasRef, isLoading, isReady })}</>;
}
