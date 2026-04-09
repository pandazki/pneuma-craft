import type { Composition, ResolvedFrame } from './types.js';

export function resolveFrame(composition: Composition, time: number): ResolvedFrame {
  const clips: ResolvedFrame['clips'] = [];

  for (const track of composition.tracks) {
    if (track.muted) continue;

    for (const clip of track.clips) {
      const clipEnd = clip.startTime + clip.duration;
      // Half-open interval: [start, end)
      if (time >= clip.startTime && time < clipEnd) {
        const localTime = clip.inPoint + (time - clip.startTime);
        clips.push({ clip, track, localTime });
      }
    }
  }

  return { time, clips };
}
