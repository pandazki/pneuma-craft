import React from 'react';
import type { Track } from '@pneuma-craft/timeline';
import { TimelineClip } from './timeline-clip.js';
import { MuteIcon, VolumeIcon, LockIcon, UnlockIcon } from '../icons.js';

export interface TimelineTrackProps {
  track: Track;
  timeToPixels: (time: number) => number;
}

export function TimelineTrack({ track, timeToPixels }: TimelineTrackProps) {
  return (
    <div className="pc-timeline-track">
      <div className="pc-timeline-track-header">
        <span className="pc-timeline-track-name">{track.name}</span>
        <span className="pc-timeline-track-status" title={track.muted ? 'Muted' : 'Audible'}>
          {track.muted ? <MuteIcon size={12} /> : <VolumeIcon size={12} />}
        </span>
        <span className="pc-timeline-track-status" title={track.locked ? 'Locked' : 'Unlocked'}>
          {track.locked ? <LockIcon size={12} /> : <UnlockIcon size={12} />}
        </span>
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
