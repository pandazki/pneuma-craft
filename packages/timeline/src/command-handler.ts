import type { PneumaCraftCoreState, CommandEnvelope, Event } from '@pneuma-craft/core';
import { generateId, CommandValidationError } from '@pneuma-craft/core';
import type { CompositionCommand, Composition, Track, Clip } from './types.js';
import type { CompositionState } from './state.js';
import { findClipById } from './composition-helpers.js';

/**
 * Generate ripple move events for clips on the same track that would overlap
 * with a clip placed at [startTime, startTime + duration).
 * Returns move events for all displaced clips.
 */
function generateRippleEvents(
  envelope: CommandEnvelope<CompositionCommand>,
  track: Track,
  startTime: number,
  duration: number,
  excludeClipId?: string,
): Event[] {
  const clipEnd = startTime + duration;
  const events: Event[] = [];

  // Find clips that overlap with [startTime, clipEnd) — sorted by startTime
  const clipsToRipple = track.clips
    .filter(c => c.id !== excludeClipId && c.startTime < clipEnd && c.startTime + c.duration > startTime)
    .sort((a, b) => a.startTime - b.startTime);

  if (clipsToRipple.length === 0) return events;

  // Calculate shift: how much to push the first overlapping clip
  let shift = clipEnd - clipsToRipple[0].startTime;
  if (shift <= 0) return events;

  // Also ripple any clips after the overlapping ones that would be displaced
  // by the chain reaction
  const allAfter = track.clips
    .filter(c => c.id !== excludeClipId && c.startTime >= startTime)
    .sort((a, b) => a.startTime - b.startTime);

  let nextFreeTime = clipEnd;
  for (const c of allAfter) {
    if (c.startTime >= nextFreeTime) break; // no more overlap in the chain
    const newStart = nextFreeTime;
    events.push(makeEvent(envelope, 'composition:clip-moved', {
      clipId: c.id,
      startTime: newStart,
      trackId: undefined,
      previousStartTime: c.startTime,
      previousTrackId: track.id,
    }));
    nextFreeTime = newStart + c.duration;
  }

  return events;
}

function makeEvent(
  envelope: CommandEnvelope<CompositionCommand>,
  type: string,
  payload: Record<string, unknown>,
): Event {
  return {
    id: generateId(),
    commandId: envelope.id,
    actor: envelope.actor,
    timestamp: envelope.timestamp,
    type,
    payload,
  };
}

function requireComposition(state: CompositionState): Composition {
  if (!state.composition) {
    throw new CommandValidationError('No composition exists');
  }
  return state.composition;
}

function requireTrack(composition: Composition, trackId: string): Track {
  const track = composition.tracks.find(t => t.id === trackId);
  if (!track) {
    throw new CommandValidationError(`Track not found: ${trackId}`);
  }
  return track;
}

function requireTrackNotLocked(track: Track): void {
  if (track.locked) {
    throw new CommandValidationError(`Track is locked: ${track.id}`);
  }
}

function requireClip(composition: Composition, clipId: string): { clip: Clip; track: Track } {
  const result = findClipById(composition, clipId);
  if (!result) {
    throw new CommandValidationError(`Clip not found: ${clipId}`);
  }
  return result;
}

export function handleCompositionCommand(
  coreState: PneumaCraftCoreState,
  compState: CompositionState,
  envelope: CommandEnvelope<CompositionCommand>,
): Event[] {
  const { command } = envelope;

  switch (command.type) {
    case 'composition:create': {
      if (compState.composition) {
        throw new CommandValidationError('Composition already exists');
      }
      const composition: Composition = {
        id: generateId(),
        settings: command.settings,
        tracks: [],
        transitions: [],
        duration: 0,
      };
      return [makeEvent(envelope, 'composition:created', { composition })];
    }

    case 'composition:add-track': {
      requireComposition(compState);
      const track: Track = { ...command.track, id: generateId() };
      return [makeEvent(envelope, 'composition:track-added', { track })];
    }

    case 'composition:remove-track': {
      const composition = requireComposition(compState);
      const track = requireTrack(composition, command.trackId);
      if (track.clips.length > 0) {
        throw new CommandValidationError(`Track has clips, remove them first: ${command.trackId}`);
      }
      return [makeEvent(envelope, 'composition:track-removed', { trackId: command.trackId, track })];
    }

    case 'composition:add-clip': {
      const composition = requireComposition(compState);
      const track = requireTrack(composition, command.trackId);
      requireTrackNotLocked(track);
      if (!coreState.registry.has(command.clip.assetId)) {
        throw new CommandValidationError(`Asset not found in registry: ${command.clip.assetId}`);
      }
      const clip: Clip = { ...command.clip, id: generateId(), trackId: command.trackId };
      const addEvent = makeEvent(envelope, 'composition:clip-added', { trackId: command.trackId, clip });
      const rippleEvents = generateRippleEvents(envelope, track, clip.startTime, clip.duration);
      return [addEvent, ...rippleEvents];
    }

    case 'composition:remove-clip': {
      const composition = requireComposition(compState);
      const { clip, track } = requireClip(composition, command.clipId);
      requireTrackNotLocked(track);
      return [makeEvent(envelope, 'composition:clip-removed', {
        clipId: command.clipId, clip, trackId: track.id,
      })];
    }

    case 'composition:move-clip': {
      const composition = requireComposition(compState);
      const { clip, track: sourceTrack } = requireClip(composition, command.clipId);
      requireTrackNotLocked(sourceTrack);
      const targetTrackId = command.trackId ?? sourceTrack.id;
      let targetTrack = sourceTrack;
      if (command.trackId && command.trackId !== sourceTrack.id) {
        targetTrack = requireTrack(composition, command.trackId);
        requireTrackNotLocked(targetTrack);
      }
      const moveEvent = makeEvent(envelope, 'composition:clip-moved', {
        clipId: command.clipId,
        startTime: command.startTime,
        trackId: command.trackId,
        previousStartTime: clip.startTime,
        previousTrackId: sourceTrack.id,
      });
      const rippleEvents = generateRippleEvents(
        envelope, targetTrack, command.startTime, clip.duration, command.clipId,
      );
      return [moveEvent, ...rippleEvents];
    }

    case 'composition:trim-clip': {
      const composition = requireComposition(compState);
      const { clip, track } = requireClip(composition, command.clipId);
      requireTrackNotLocked(track);
      return [makeEvent(envelope, 'composition:clip-trimmed', {
        clipId: command.clipId,
        inPoint: command.inPoint ?? clip.inPoint,
        outPoint: command.outPoint ?? clip.outPoint,
        duration: command.duration ?? clip.duration,
        previousInPoint: clip.inPoint,
        previousOutPoint: clip.outPoint,
        previousDuration: clip.duration,
      })];
    }

    case 'composition:split-clip': {
      const composition = requireComposition(compState);
      const { clip, track } = requireClip(composition, command.clipId);
      requireTrackNotLocked(track);
      const clipEnd = clip.startTime + clip.duration;
      if (command.time <= clip.startTime || command.time >= clipEnd) {
        throw new CommandValidationError(
          `Split time ${command.time} is not within clip range (${clip.startTime}, ${clipEnd})`,
        );
      }
      const splitOffset = command.time - clip.startTime;
      const leftClip: Clip = {
        ...clip,
        duration: splitOffset,
        outPoint: clip.inPoint + splitOffset,
      };
      const newClipId = generateId();
      const rightClip: Clip = {
        ...clip,
        id: newClipId,
        startTime: command.time,
        duration: clip.duration - splitOffset,
        inPoint: clip.inPoint + splitOffset,
      };
      return [makeEvent(envelope, 'composition:clip-split', {
        clipId: command.clipId,
        time: command.time,
        newClipId,
        leftClip,
        rightClip,
        originalClip: clip,
      })];
    }

    case 'composition:reorder-tracks': {
      const composition = requireComposition(compState);
      const currentIds = composition.tracks.map(t => t.id);
      if (command.trackIds.length !== currentIds.length) {
        throw new CommandValidationError('Track ID count mismatch');
      }
      const idSet = new Set(command.trackIds);
      if (idSet.size !== command.trackIds.length) {
        throw new CommandValidationError('Duplicate track IDs');
      }
      for (const id of command.trackIds) {
        if (!currentIds.includes(id)) {
          throw new CommandValidationError(`Unknown track ID: ${id}`);
        }
      }
      return [makeEvent(envelope, 'composition:tracks-reordered', {
        trackIds: command.trackIds,
        previousTrackIds: currentIds,
      })];
    }

    default:
      throw new CommandValidationError(`Unknown composition command: ${(command as CompositionCommand).type}`);
  }
}
