import React, { useState, createContext, useContext } from 'react';
import { TimelineRoot as HeadlessTimeline } from '@pneuma-craft/react';
import type { TimelineState } from '@pneuma-craft/react';
import { TimelineToolbar } from './timeline-toolbar.js';
import { TimelineTrackList } from './timeline-track-list.js';
import { TimelinePlayhead } from './timeline-playhead.js';
import './timeline.css';

const TimelineContext = createContext<TimelineState | null>(null);

function useTimelineContext(): TimelineState {
  const ctx = useContext(TimelineContext);
  if (!ctx) throw new Error('Timeline sub-component must be used within <Timeline>');
  return ctx;
}

export interface TimelineProps {
  className?: string;
  style?: React.CSSProperties;
  defaultPixelsPerSecond?: number;
  children?: React.ReactNode;
}

function CompoundToolbar({ pps, onZoomChange }: { pps?: number; onZoomChange?: (v: number) => void }) {
  const state = useTimelineContext();
  return <TimelineToolbar duration={state.duration} pixelsPerSecond={pps ?? 100} onZoomChange={onZoomChange ?? (() => {})} />;
}

function CompoundTrackList() {
  const state = useTimelineContext();
  return <TimelineTrackList tracks={state.tracks} timeToPixels={state.timeToPixels} />;
}

function CompoundPlayhead() {
  const state = useTimelineContext();
  return <TimelinePlayhead position={state.playheadPosition} />;
}

function TimelineBase({
  className,
  style,
  defaultPixelsPerSecond = 100,
  children,
}: TimelineProps) {
  const [pixelsPerSecond, setPixelsPerSecond] = useState(defaultPixelsPerSecond);

  return (
    <HeadlessTimeline pixelsPerSecond={pixelsPerSecond}>
      {(state) => (
        <TimelineContext.Provider value={state}>
          <div className={`pc-timeline ${className ?? ''}`} style={style}>
            {children ?? (
              <>
                <CompoundToolbar pps={pixelsPerSecond} onZoomChange={setPixelsPerSecond} />
                <div className="pc-timeline-body">
                  <CompoundTrackList />
                  <CompoundPlayhead />
                </div>
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
  TrackList: CompoundTrackList,
  Playhead: CompoundPlayhead,
});
