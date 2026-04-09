import React from 'react';
import type { Track } from '@pneuma-craft/timeline';
import { TimelineClip } from './timeline-clip.js';
import { IconButton } from '../atoms/index.js';

export interface TimelineTrackProps {
  track: Track;
  timeToPixels: (time: number) => number;
}

export function TimelineTrack({ track, timeToPixels }: TimelineTrackProps) {
  return (
    <div className="pc-timeline-track">
      <div className="pc-timeline-track-header">
        <span className="pc-timeline-track-name">{track.name}</span>
        <IconButton
          icon={track.muted ? 'mute' : 'volume'}
          label={track.muted ? 'Unmute' : 'Mute'}
          size={12}
        />
        <IconButton
          icon={track.locked ? 'lock' : 'unlock'}
          label={track.locked ? 'Unlock' : 'Lock'}
          size={12}
        />
      </div>
      <div className="pc-timeline-track-clips">
        {track.clips.map((clip) => (
          <TimelineClip
            key={clip.id}
            clip={clip}
            trackType={track.type}
            timeToPixels={timeToPixels}
          />
        ))}
      </div>
    </div>
  );
}
