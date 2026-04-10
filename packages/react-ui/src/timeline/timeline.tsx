import React, { useState, useCallback, useRef, createContext, useContext } from 'react';
import { TimelineRoot as HeadlessTimeline } from '@pneuma-craft/react';
import type { TimelineState } from '@pneuma-craft/react';
import { TimelineToolbar } from './timeline-toolbar.js';
import { TimelineTrackList } from './timeline-track-list.js';
import { TimelinePlayhead } from './timeline-playhead.js';
import './timeline.css';

interface TimelineContextValue extends TimelineState {
  pixelsPerSecond: number;
  setPixelsPerSecond: (v: number) => void;
  onSeek?: (time: number) => void;
  onClipMove?: (clipId: string, newStartTime: number) => void;
  onClipSplit?: (clipId: string, time: number) => void;
  onClipSelect?: (clipId: string) => void;
  onAssetDrop?: (assetId: string, time: number) => void;
  onClipDragStart?: () => void;
  toolbarExtra?: React.ReactNode;
  selectedClipIds?: string[];
}

const TimelineContext = createContext<TimelineContextValue | null>(null);

function useTimelineContext(): TimelineContextValue {
  const ctx = useContext(TimelineContext);
  if (!ctx) throw new Error('Timeline sub-component must be used within <Timeline>');
  return ctx;
}

export interface TimelineProps {
  className?: string;
  style?: React.CSSProperties;
  defaultPixelsPerSecond?: number;
  onSeek?: (time: number) => void;
  onClipMove?: (clipId: string, newStartTime: number) => void;
  onClipSplit?: (clipId: string, time: number) => void;
  onClipSelect?: (clipId: string) => void;
  onAssetDrop?: (assetId: string, time: number) => void;
  onClipDragStart?: () => void;
  toolbarExtra?: React.ReactNode;
  selectedClipIds?: string[];
  children?: React.ReactNode;
}

function CompoundToolbar() {
  const { duration, pixelsPerSecond, setPixelsPerSecond, toolbarExtra } = useTimelineContext();
  return <TimelineToolbar duration={duration} pixelsPerSecond={pixelsPerSecond} onZoomChange={setPixelsPerSecond} extraActions={toolbarExtra} />;
}

function CompoundTrackList() {
  const state = useTimelineContext();
  return (
    <TimelineTrackList
      tracks={state.tracks}
      duration={state.duration}
      timeToPixels={state.timeToPixels}
      pixelsToTime={state.pixelsToTime}
      onClipMove={state.onClipMove}
      onClipSplit={state.onClipSplit}
      onClipSelect={state.onClipSelect}
      onClipDragStart={state.onClipDragStart}
      selectedClipIds={state.selectedClipIds}
    />
  );
}

function CompoundPlayhead() {
  const state = useTimelineContext();
  return <TimelinePlayhead position={state.playheadPosition} timeToPixels={state.timeToPixels} />;
}

function CompoundBody({ children }: { children: React.ReactNode }) {
  const { pixelsToTime, onSeek, onAssetDrop } = useTimelineContext();
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const pixelsToTimeRef = useRef(pixelsToTime);
  pixelsToTimeRef.current = pixelsToTime;

  const seekFromEvent = useCallback(
    (clientX: number, target: HTMLElement) => {
      const p2t = pixelsToTimeRef.current;
      const seek = onSeekRef.current;
      if (!p2t || !seek) return;
      const rect = target.getBoundingClientRect();
      const x = clientX - rect.left + target.scrollLeft - 120;
      if (x < 0) return;
      seek(p2t(x));
    },
    [],
  );

  // Mousedown → continuous seek on mousemove → mouseup stops
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !onSeek) return;
      // Don't interfere with clip drag (clips stopPropagation on mousedown)
      const el = e.currentTarget;
      seekFromEvent(e.clientX, el);

      const onMove = (ev: MouseEvent) => seekFromEvent(ev.clientX, el);
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [onSeek, seekFromEvent],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-pneuma-asset-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const assetId = e.dataTransfer.getData('application/x-pneuma-asset-id');
      if (!assetId || !onAssetDrop) return;
      const p2t = pixelsToTimeRef.current;
      if (!p2t) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left + e.currentTarget.scrollLeft - 120;
      const time = Math.max(0, p2t(x));
      onAssetDrop(assetId, time);
    },
    [onAssetDrop],
  );

  return (
    <div
      className="pc-timeline-body"
      onMouseDown={handleMouseDown}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ cursor: onSeek ? 'crosshair' : undefined }}
    >
      {children}
    </div>
  );
}

function TimelineBase({
  className,
  style,
  defaultPixelsPerSecond = 100,
  onSeek,
  onClipMove,
  onClipSplit,
  onClipSelect,
  onAssetDrop,
  onClipDragStart,
  toolbarExtra,
  selectedClipIds,
  children,
}: TimelineProps) {
  const [pixelsPerSecond, setPixelsPerSecond] = useState(defaultPixelsPerSecond);

  return (
    <HeadlessTimeline pixelsPerSecond={pixelsPerSecond}>
      {(state) => (
        <TimelineContext.Provider value={{ ...state, pixelsPerSecond, setPixelsPerSecond, onSeek, onClipMove, onClipSplit, onClipSelect, onAssetDrop, onClipDragStart, toolbarExtra, selectedClipIds }}>
          <div className={`pc-timeline ${className ?? ''}`} style={style}>
            {children ?? (
              <>
                <CompoundToolbar />
                <CompoundBody>
                  <CompoundTrackList />
                  <CompoundPlayhead />
                </CompoundBody>
              </>
            )}
          </div>
        </TimelineContext.Provider>
      )}
    </HeadlessTimeline>
  );
}

export const Timeline = Object.assign(TimelineBase, {
  Toolbar: CompoundToolbar,
  Body: CompoundBody,
  TrackList: CompoundTrackList,
  Playhead: CompoundPlayhead,
});
