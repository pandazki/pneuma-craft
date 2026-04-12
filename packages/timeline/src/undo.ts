import type { Event } from '@pneuma-craft/core';
import { generateId } from '@pneuma-craft/core';
import { asCompositionEvent } from './events.js';

export function invertCompositionEvent(event: Event): Event {
  const e = asCompositionEvent(event);
  const base = {
    id: generateId(),
    commandId: event.commandId,
    actor: event.actor,
    timestamp: Date.now(),
  };

  switch (e.type) {
    case 'composition:created':
      throw new Error('Cannot invert composition:created — undo of create is not supported');

    case 'composition:track-added':
      return { ...base, type: 'composition:track-removed', payload: {
        trackId: e.payload.track.id, track: e.payload.track,
      }};

    case 'composition:track-removed':
      return { ...base, type: 'composition:track-added', payload: {
        track: e.payload.track,
      }};

    case 'composition:clip-added':
      return { ...base, type: 'composition:clip-removed', payload: {
        clipId: e.payload.clip.id, clip: e.payload.clip, trackId: e.payload.trackId,
      }};

    case 'composition:clip-removed':
      return { ...base, type: 'composition:clip-added', payload: {
        trackId: e.payload.trackId, clip: e.payload.clip,
      }};

    case 'composition:clip-moved':
      return { ...base, type: 'composition:clip-moved', payload: {
        clipId: e.payload.clipId,
        startTime: e.payload.previousStartTime,
        trackId: e.payload.previousTrackId,
        previousStartTime: e.payload.startTime,
        previousTrackId: e.payload.trackId ?? e.payload.previousTrackId,
      }};

    case 'composition:clip-trimmed':
      return { ...base, type: 'composition:clip-trimmed', payload: {
        clipId: e.payload.clipId,
        inPoint: e.payload.previousInPoint,
        outPoint: e.payload.previousOutPoint,
        duration: e.payload.previousDuration,
        previousInPoint: e.payload.inPoint,
        previousOutPoint: e.payload.outPoint,
        previousDuration: e.payload.duration,
      }};

    case 'composition:clip-split':
      return { ...base, type: 'composition:clip-unsplit', payload: {
        clipId: e.payload.clipId,
        newClipId: e.payload.newClipId,
        originalClip: e.payload.originalClip,
      }};

    case 'composition:tracks-reordered':
      return { ...base, type: 'composition:tracks-reordered', payload: {
        trackIds: e.payload.previousTrackIds,
        previousTrackIds: e.payload.trackIds,
      }};

    case 'composition:track-mute-toggled':
      return { ...base, type: 'composition:track-mute-toggled', payload: {
        trackId: e.payload.trackId,
        muted: e.payload.previousMuted,
        previousMuted: e.payload.muted,
      }};

    case 'composition:track-lock-toggled':
      return { ...base, type: 'composition:track-lock-toggled', payload: {
        trackId: e.payload.trackId,
        locked: e.payload.previousLocked,
        previousLocked: e.payload.locked,
      }};

    case 'composition:track-visibility-toggled':
      return { ...base, type: 'composition:track-visibility-toggled', payload: {
        trackId: e.payload.trackId,
        visible: e.payload.previousVisible,
        previousVisible: e.payload.visible,
      }};

    case 'composition:clip-duplicated':
      return { ...base, type: 'composition:clip-removed', payload: {
        clipId: e.payload.clip.id, clip: e.payload.clip, trackId: e.payload.trackId,
      }};

    case 'composition:clip-rebound':
      return { ...base, type: 'composition:clip-rebound', payload: {
        clipId: e.payload.clipId,
        assetId: e.payload.previousAssetId,
        previousAssetId: e.payload.assetId,
      }};

    case 'composition:track-renamed':
      return { ...base, type: 'composition:track-renamed', payload: {
        trackId: e.payload.trackId,
        name: e.payload.previousName,
        previousName: e.payload.name,
      }};

    default:
      throw new Error(`Cannot invert unknown composition event: ${(e as Event).type}`);
  }
}
