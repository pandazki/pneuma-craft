import type { Composition, Track, Clip, PreviewFrame } from './types.js';

export function computeDuration(composition: Composition): number {
  let max = 0;
  for (const track of composition.tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > max) max = end;
    }
    for (const pf of track.previewFrames) {
      if (pf.time > max) max = pf.time;
    }
  }
  return max;
}

export function recomputeDuration(composition: Composition): Composition {
  return { ...composition, duration: computeDuration(composition) };
}

function sortClips(clips: readonly Clip[]): Clip[] {
  return [...clips].sort((a, b) => a.startTime - b.startTime);
}

export function addClipToTrack(
  composition: Composition,
  trackId: string,
  clip: Clip,
): Composition {
  let found = false;
  const tracks = composition.tracks.map(track => {
    if (track.id !== trackId) return track;
    found = true;
    return { ...track, clips: sortClips([...track.clips, clip]) };
  });
  if (!found) throw new Error(`Track not found: ${trackId}`);
  return { ...composition, tracks };
}

export function removeClipFromComposition(
  composition: Composition,
  clipId: string,
): Composition {
  return {
    ...composition,
    tracks: composition.tracks.map(track => ({
      ...track,
      clips: track.clips.filter(c => c.id !== clipId),
    })),
  };
}

export function updateClipInComposition(
  composition: Composition,
  clipId: string,
  updater: (clip: Clip) => Clip,
): Composition {
  return {
    ...composition,
    tracks: composition.tracks.map(track => {
      const hasClip = track.clips.some(c => c.id === clipId);
      if (!hasClip) return track;
      return {
        ...track,
        clips: sortClips(track.clips.map(c => c.id === clipId ? updater(c) : c)),
      };
    }),
  };
}

export function findClipById(
  composition: Composition,
  clipId: string,
): { clip: Clip; track: Track } | undefined {
  for (const track of composition.tracks) {
    const clip = track.clips.find(c => c.id === clipId);
    if (clip) return { clip, track };
  }
  return undefined;
}

export function findTrackByClipId(
  composition: Composition,
  clipId: string,
): Track | undefined {
  return composition.tracks.find(track => track.clips.some(c => c.id === clipId));
}

// ── Preview Frame Helpers ──────────────────────────────────────────────

function sortPreviewFrames(frames: readonly PreviewFrame[]): PreviewFrame[] {
  return [...frames].sort((a, b) => a.time - b.time);
}

export function addPreviewFrame(
  composition: Composition,
  trackId: string,
  previewFrame: PreviewFrame,
): Composition {
  let found = false;
  const tracks = composition.tracks.map(track => {
    if (track.id !== trackId) return track;
    found = true;
    return {
      ...track,
      previewFrames: sortPreviewFrames([...track.previewFrames, previewFrame]),
    };
  });
  if (!found) throw new Error(`Track not found: ${trackId}`);
  return { ...composition, tracks };
}

export function removePreviewFrameFromComposition(
  composition: Composition,
  previewFrameId: string,
): Composition {
  return {
    ...composition,
    tracks: composition.tracks.map(track => ({
      ...track,
      previewFrames: track.previewFrames.filter(pf => pf.id !== previewFrameId),
    })),
  };
}

export function updatePreviewFrameInComposition(
  composition: Composition,
  previewFrameId: string,
  updater: (pf: PreviewFrame) => PreviewFrame,
): Composition {
  return {
    ...composition,
    tracks: composition.tracks.map(track => {
      const has = track.previewFrames.some(pf => pf.id === previewFrameId);
      if (!has) return track;
      return {
        ...track,
        previewFrames: sortPreviewFrames(
          track.previewFrames.map(pf => pf.id === previewFrameId ? updater(pf) : pf),
        ),
      };
    }),
  };
}

export function findPreviewFrameById(
  composition: Composition,
  previewFrameId: string,
): { previewFrame: PreviewFrame; track: Track } | undefined {
  for (const track of composition.tracks) {
    const previewFrame = track.previewFrames.find(pf => pf.id === previewFrameId);
    if (previewFrame) return { previewFrame, track };
  }
  return undefined;
}

// Returns the preview frame on a track with the GREATEST time ≤ `time`,
// or undefined if no preview frame qualifies. Assumes the array is sorted
// by time (invariant I5 — maintained by addPreviewFrame /
// updatePreviewFrameInComposition).
export function findGreatestPreviewFrameAtOrBefore(
  previewFrames: readonly PreviewFrame[],
  time: number,
): PreviewFrame | undefined {
  if (previewFrames.length === 0) return undefined;

  let lo = 0;
  let hi = previewFrames.length - 1;
  let result: PreviewFrame | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (previewFrames[mid].time <= time) {
      result = previewFrames[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}
