import type { Composition, ResolvedFrame } from './types.js';

export function resolveFrame(composition: Composition, time: number): ResolvedFrame {
  const clips: ResolvedFrame['clips'] = [];

  for (const track of composition.tracks) {
    if (track.muted) continue;
    // Hidden tracks are excluded from the resolved frame so they neither
    // render in preview nor appear in export. Mirrors the existing `muted`
    // treatment for audio — `visible === false` is the video-layer opt-out.
    // Use `=== false` (not `!track.visible`) so legacy compositions where
    // `visible` is `undefined` keep their pre-0.2 behavior of being shown.
    if (track.visible === false) continue;

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
