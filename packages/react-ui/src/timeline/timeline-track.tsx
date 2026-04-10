import React, { useMemo } from 'react';
import type { Track } from '@pneuma-craft/timeline';
import { TimelineClip } from './timeline-clip.js';
import { MuteIcon, VolumeIcon, LockIcon, UnlockIcon } from '../icons.js';

export interface TimelineTrackProps {
  track: Track;
  timeToPixels: (time: number) => number;
  pixelsToTime?: (px: number) => number;
  onClipMove?: (clipId: string, newStartTime: number) => void;
  onClipSplit?: (clipId: string, time: number) => void;
}

export function TimelineTrack({ track, timeToPixels, pixelsToTime, onClipMove, onClipSplit }: TimelineTrackProps) {
  // Compute snap targets: all clip start/end times + time 0
  const allSnapTargets = useMemo(() => {
    const targets = new Set<number>([0]);
    for (const clip of track.clips) {
      targets.add(clip.startTime);
      targets.add(clip.startTime + clip.duration);
    }
    return Array.from(targets);
  }, [track.clips]);

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
        {track.clips.map((clip) => {
          // Exclude this clip's own edges from snap targets
          const snapTargets = allSnapTargets.filter(
            (t) => t !== clip.startTime && t !== clip.startTime + clip.duration,
          );
          return (
            <TimelineClip
              key={clip.id}
              clip={clip}
              trackType={track.type}
              timeToPixels={timeToPixels}
              pixelsToTime={pixelsToTime}
              snapTargets={snapTargets}
              onMove={onClipMove}
              onSplit={onClipSplit}
            />
          );
        })}
      </div>
    </div>
  );
}
