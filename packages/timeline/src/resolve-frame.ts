import type { Composition, ResolvedFrame, ResolvedClip, ResolvedPreviewFrame } from './types.js';
import { findGreatestPreviewFrameAtOrBefore } from './composition-helpers.js';

export function resolveFrame(composition: Composition, time: number): ResolvedFrame {
  const clips: ResolvedClip[] = [];
  const previewFrames: ResolvedPreviewFrame[] = [];

  for (const track of composition.tracks) {
    // `muted` is NOT checked here: it's a pure audio concept and is enforced
    // by the audio scheduler / offline renderer. A video track with
    // `muted: true` should go silent but keep showing its picture — this
    // function is the picture path only. Use `visible === false` to hide
    // the picture (explicit `=== false` so legacy compositions where the
    // field is absent still render).
    if (track.visible === false) continue;

    let trackHasActiveClip = false;
    for (const clip of track.clips) {
      const clipEnd = clip.startTime + clip.duration;
      // Half-open interval: [start, end)
      if (time >= clip.startTime && time < clipEnd) {
        const localTime = clip.inPoint + (time - clip.startTime);
        clips.push({ clip, track, localTime });
        trackHasActiveClip = true;
      }
    }

    // Preview-frame fallback runs ONLY when:
    //   1. The track has no active clip at `time` (per-track let-go rule)
    //   2. The track is a video track (v1 scope — audio/subtitle preview
    //      frames are forbidden by the command handler invariant I2)
    // The result is the preview frame with the GREATEST time ≤ `time` —
    // i.e., a step function whose steps are the registered preview points.
    if (!trackHasActiveClip && track.type === 'video' && track.previewFrames.length > 0) {
      const pf = findGreatestPreviewFrameAtOrBefore(track.previewFrames, time);
      if (pf) previewFrames.push({ previewFrame: pf, track });
    }
  }

  return { time, clips, previewFrames };
}
