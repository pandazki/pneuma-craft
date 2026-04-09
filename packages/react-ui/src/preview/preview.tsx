import React, { useCallback } from 'react';
import { PreviewRoot, usePlayback, useComposition } from '@pneuma-craft/react';
import { IconButton } from '../atoms/index.js';
import './preview.css';

export interface PreviewProps {
  className?: string;
  style?: React.CSSProperties;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}

function PreviewControls() {
  const { state, currentTime, duration, play, pause, seek } = usePlayback();
  const isPlaying = state === 'playing';

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      seek(parseFloat(e.target.value));
    },
    [seek],
  );

  return (
    <div className="pc-preview-controls">
      <IconButton
        icon={isPlaying ? 'pause' : 'play'}
        label={isPlaying ? 'Pause' : 'Play'}
        onClick={isPlaying ? pause : play}
      />
      <span className="pc-preview-time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <input
        type="range"
        className="pc-preview-seekbar"
        min={0}
        max={duration || 1}
        step={0.01}
        value={currentTime}
        onChange={handleSeek}
      />
    </div>
  );
}

function PreviewCanvas() {
  const composition = useComposition();
  const width = composition?.width ?? 1920;
  const height = composition?.height ?? 1080;

  return (
    <PreviewRoot>
      {({ canvasRef, isLoading }) => (
        <div className="pc-preview-canvas-container" style={{ aspectRatio: `${width}/${height}` }}>
          <canvas ref={canvasRef} width={width} height={height} />
          {isLoading && (
            <div className="pc-preview-loading">Loading...</div>
          )}
        </div>
      )}
    </PreviewRoot>
  );
}

export function Preview({ className, style }: PreviewProps) {
  return (
    <div className={`pc-preview ${className ?? ''}`} style={style}>
      <PreviewCanvas />
      <PreviewControls />
    </div>
  );
}
