import type { Composition, Track, Clip } from './types.js';

export function computeDuration(composition: Composition): number {
  let max = 0;
  for (const track of composition.tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > max) max = end;
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
