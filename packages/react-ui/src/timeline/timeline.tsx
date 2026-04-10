import React, { useState, useCallback, createContext, useContext } from 'react';
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
  selectedClipIds?: string[];
  children?: React.ReactNode;
}

function CompoundToolbar() {
  const { duration, pixelsPerSecond, setPixelsPerSecond } = useTimelineContext();
  return <TimelineToolbar duration={duration} pixelsPerSecond={pixelsPerSecond} onZoomChange={setPixelsPerSecond} />;
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
      selectedClipIds={state.selectedClipIds}
    />
  );
}

function CompoundPlayhead() {
  const state = useTimelineContext();
  return <TimelinePlayhead position={state.playheadPosition} timeToPixels={state.timeToPixels} />;
}

function CompoundBody({ children }: { children: React.ReactNode }) {
  const { pixelsToTime, onSeek } = useTimelineContext();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSeek) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left + e.currentTarget.scrollLeft - 120; // 120 = track header width
      if (x < 0) return;
      onSeek(pixelsToTime(x));
    },
    [pixelsToTime, onSeek],
  );

  return (
    <div className="pc-timeline-body" onClick={handleClick} style={{ cursor: onSeek ? 'crosshair' : undefined }}>
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
  selectedClipIds,
  children,
}: TimelineProps) {
  const [pixelsPerSecond, setPixelsPerSecond] = useState(defaultPixelsPerSecond);

  return (
    <HeadlessTimeline pixelsPerSecond={pixelsPerSecond}>
      {(state) => (
        <TimelineContext.Provider value={{ ...state, pixelsPerSecond, setPixelsPerSecond, onSeek, onClipMove, onClipSplit, onClipSelect, selectedClipIds }}>
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
