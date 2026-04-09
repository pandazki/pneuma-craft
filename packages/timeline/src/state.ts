import type { Event } from '@pneuma-craft/core';
import type { Composition, Clip } from './types.js';
import { asCompositionEvent } from './events.js';
import {
  addClipToTrack,
  removeClipFromComposition,
  updateClipInComposition,
  recomputeDuration,
} from './composition-helpers.js';

export interface CompositionState {
  readonly composition: Composition | null;
}

export function createInitialCompositionState(): CompositionState {
  return { composition: null };
}

export function applyCompositionEvent(
  state: CompositionState,
  event: Event,
): CompositionState {
  if (!event.type.startsWith('composition:')) return state;

  const e = asCompositionEvent(event);

  switch (e.type) {
    case 'composition:created': {
      return { composition: e.payload.composition };
    }

    case 'composition:track-added': {
      const comp = state.composition!;
      return {
        composition: { ...comp, tracks: [...comp.tracks, e.payload.track] },
      };
    }

    case 'composition:track-removed': {
      const comp = state.composition!;
      return {
        composition: recomputeDuration({
          ...comp,
          tracks: comp.tracks.filter(t => t.id !== e.payload.trackId),
        }),
      };
    }

    case 'composition:clip-added': {
      const comp = state.composition!;
      return {
        composition: recomputeDuration(
          addClipToTrack(comp, e.payload.trackId, e.payload.clip),
        ),
      };
    }

    case 'composition:clip-removed': {
      const comp = state.composition!;
      return {
        composition: recomputeDuration(
          removeClipFromComposition(comp, e.payload.clipId),
        ),
      };
    }

    case 'composition:clip-moved': {
      const comp = state.composition!;
      const { clipId, startTime, trackId, previousTrackId } = e.payload;

      if (trackId && trackId !== previousTrackId) {
        let updated = removeClipFromComposition(comp, clipId);
        const originalClip = comp.tracks
          .flatMap(t => t.clips)
          .find(c => c.id === clipId)!;
        const movedClip: Clip = { ...originalClip, startTime, trackId };
        updated = addClipToTrack(updated, trackId, movedClip);
        return { composition: recomputeDuration(updated) };
      }

      return {
        composition: recomputeDuration(
          updateClipInComposition(comp, clipId, clip => ({ ...clip, startTime })),
        ),
      };
    }

    case 'composition:clip-trimmed': {
      const comp = state.composition!;
      const { clipId, inPoint, outPoint, duration } = e.payload;
      return {
        composition: recomputeDuration(
          updateClipInComposition(comp, clipId, clip => ({
            ...clip, inPoint, outPoint, duration,
          })),
        ),
      };
    }

    case 'composition:clip-split': {
      const comp = state.composition!;
      const { clipId, leftClip, rightClip } = e.payload;
      let updated = updateClipInComposition(comp, clipId, () => leftClip);
      const trackId = leftClip.trackId;
      updated = addClipToTrack(updated, trackId, rightClip);
      return { composition: recomputeDuration(updated) };
    }

    case 'composition:tracks-reordered': {
      const comp = state.composition!;
      const trackMap = new Map(comp.tracks.map(t => [t.id, t]));
      const reordered = e.payload.trackIds.map(id => trackMap.get(id)!);
      return { composition: { ...comp, tracks: reordered } };
    }

    // Handle undo of split (composition:clip-unsplit)
    // This is not in the CompositionEvent union — it's an internal compensation event
    default: {
      if (event.type === 'composition:clip-unsplit') {
        const comp = state.composition!;
        const { clipId, newClipId, originalClip } = event.payload as {
          clipId: string; newClipId: string; originalClip: Clip;
        };
        let updated = removeClipFromComposition(comp, newClipId);
        updated = updateClipInComposition(updated, clipId, () => originalClip);
        return { composition: recomputeDuration(updated) };
      }
      return state;
    }
  }
}
