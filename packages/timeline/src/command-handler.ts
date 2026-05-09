import type { PneumaCraftCoreState, CommandEnvelope, Event } from '@pneuma-craft/core';
import { generateId, CommandValidationError } from '@pneuma-craft/core';
import type { CompositionCommand, Composition, Track, Clip, PreviewFrame } from './types.js';
import type { CompositionState } from './state.js';
import { findClipById, findPreviewFrameById } from './composition-helpers.js';

/**
 * Generate ripple move events for clips on the same track that would overlap
 * with a clip placed at [startTime, startTime + duration).
 * Returns move events for all displaced clips, pushing them after the placed clip.
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

  // Collect all clips except the one being moved, sorted by startTime
  const others = track.clips
    .filter(c => c.id !== excludeClipId)
    .sort((a, b) => a.startTime - b.startTime);

  // Walk through clips and push any that overlap with the placed clip or
  // are displaced by a chain reaction from earlier pushes.
  let nextFreeTime = clipEnd;
  for (const c of others) {
    const cEnd = c.startTime + c.duration;
    // Does this clip overlap with the placed region [startTime, clipEnd)?
    const overlapsPlaced = c.startTime < clipEnd && cEnd > startTime;
    // Does this clip overlap with the chain-pushed region?
    const overlapsChain = c.startTime < nextFreeTime && cEnd > startTime;

    if (overlapsPlaced || (overlapsChain && c.startTime < nextFreeTime)) {
      const newStart = nextFreeTime;
      if (newStart !== c.startTime) {
        events.push(makeEvent(envelope, 'composition:clip-moved', {
          clipId: c.id,
          startTime: newStart,
          trackId: undefined,
          previousStartTime: c.startTime,
          previousTrackId: track.id,
        }));
      }
      nextFreeTime = newStart + c.duration;
    } else if (c.startTime >= nextFreeTime) {
      // No more overlap in the chain, and this clip is past the danger zone
      break;
    }
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

function requirePreviewFrame(
  composition: Composition,
  previewFrameId: string,
): { previewFrame: PreviewFrame; track: Track } {
  const result = findPreviewFrameById(composition, previewFrameId);
  if (!result) {
    throw new CommandValidationError(`Preview frame not found: ${previewFrameId}`);
  }
  return result;
}

// Verify the asset exists in the registry AND is of type 'image' — preview
// frames must reference image assets (spec §3.2 invariant I3). Stricter than
// the clip-side check, which accepts any asset type.
function requireImageAsset(state: PneumaCraftCoreState, assetId: string): void {
  const asset = state.registry.get(assetId);
  if (!asset) {
    throw new CommandValidationError(`Asset not found in registry: ${assetId}`);
  }
  if (asset.type !== 'image') {
    throw new CommandValidationError(
      `Preview frame asset must be type 'image', got '${asset.type}': ${assetId}`,
    );
  }
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
      const composition = requireComposition(compState);
      const id = command.track.id ?? generateId();
      if (composition.tracks.some(t => t.id === id)) {
        throw new CommandValidationError(`Track already exists: ${id}`);
      }
      const track: Track = {
        ...command.track,
        id,
        previewFrames: command.track.previewFrames ?? [],
      };
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
      const id = command.clip.id ?? generateId();
      // Clip ids are globally unique across all tracks in the composition.
      for (const t of composition.tracks) {
        if (t.clips.some(c => c.id === id)) {
          throw new CommandValidationError(`Clip already exists: ${id}`);
        }
      }
      const clip: Clip = { ...command.clip, id, trackId: command.trackId };
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

    case 'composition:toggle-track-mute': {
      const composition = requireComposition(compState);
      const track = requireTrack(composition, command.trackId);
      return [makeEvent(envelope, 'composition:track-mute-toggled', {
        trackId: command.trackId,
        muted: !track.muted,
        previousMuted: track.muted,
      })];
    }

    case 'composition:toggle-track-lock': {
      const composition = requireComposition(compState);
      const track = requireTrack(composition, command.trackId);
      return [makeEvent(envelope, 'composition:track-lock-toggled', {
        trackId: command.trackId,
        locked: !track.locked,
        previousLocked: track.locked,
      })];
    }

    case 'composition:toggle-track-visibility': {
      const composition = requireComposition(compState);
      const track = requireTrack(composition, command.trackId);
      return [makeEvent(envelope, 'composition:track-visibility-toggled', {
        trackId: command.trackId,
        visible: !track.visible,
        previousVisible: track.visible,
      })];
    }

    case 'composition:duplicate-clip': {
      const composition = requireComposition(compState);
      const { clip, track } = requireClip(composition, command.clipId);
      requireTrackNotLocked(track);
      const newClip: Clip = {
        ...clip,
        id: generateId(),
        startTime: clip.startTime + clip.duration,
      };
      const addEvent = makeEvent(envelope, 'composition:clip-duplicated', {
        sourceClipId: command.clipId,
        clip: newClip,
        trackId: track.id,
      });
      const rippleEvents = generateRippleEvents(
        envelope, track, newClip.startTime, newClip.duration, command.clipId,
      );
      return [addEvent, ...rippleEvents];
    }

    case 'composition:rebind-clip': {
      const composition = requireComposition(compState);
      const { clip, track } = requireClip(composition, command.clipId);
      requireTrackNotLocked(track);
      if (!coreState.registry.has(command.assetId)) {
        throw new CommandValidationError(`Asset not found in registry: ${command.assetId}`);
      }
      return [makeEvent(envelope, 'composition:clip-rebound', {
        clipId: command.clipId,
        assetId: command.assetId,
        previousAssetId: clip.assetId,
      })];
    }

    case 'composition:rename-track': {
      const composition = requireComposition(compState);
      const track = requireTrack(composition, command.trackId);
      return [makeEvent(envelope, 'composition:track-renamed', {
        trackId: command.trackId,
        name: command.name,
        previousName: track.name,
      })];
    }

    case 'composition:add-preview-frame': {
      const composition = requireComposition(compState);
      const track = requireTrack(composition, command.trackId);
      requireTrackNotLocked(track);
      if (track.type !== 'video') {
        throw new CommandValidationError(
          `Preview frames are only supported on video tracks, got '${track.type}': ${command.trackId}`,
        );
      }
      if (command.time < 0) {
        throw new CommandValidationError(`Preview frame time must be >= 0, got ${command.time}`);
      }
      if (track.previewFrames.some(pf => pf.time === command.time)) {
        throw new CommandValidationError(
          `Preview frame already exists at (track=${command.trackId}, time=${command.time})`,
        );
      }
      requireImageAsset(coreState, command.assetId);
      const id = command.id ?? generateId();
      // Preview frame ids are globally unique across all tracks.
      for (const t of composition.tracks) {
        if (t.previewFrames.some(pf => pf.id === id)) {
          throw new CommandValidationError(`Preview frame already exists: ${id}`);
        }
      }
      const previewFrame: PreviewFrame = {
        id,
        trackId: command.trackId,
        time: command.time,
        assetId: command.assetId,
      };
      return [makeEvent(envelope, 'composition:preview-frame-added', { previewFrame })];
    }

    case 'composition:remove-preview-frame': {
      const composition = requireComposition(compState);
      const { previewFrame, track } = requirePreviewFrame(composition, command.previewFrameId);
      requireTrackNotLocked(track);
      return [makeEvent(envelope, 'composition:preview-frame-removed', {
        previewFrameId: command.previewFrameId,
        previewFrame,
        trackId: track.id,
      })];
    }

    case 'composition:move-preview-frame': {
      const composition = requireComposition(compState);
      const { previewFrame, track: sourceTrack } = requirePreviewFrame(composition, command.previewFrameId);
      requireTrackNotLocked(sourceTrack);
      if (command.time < 0) {
        throw new CommandValidationError(`Preview frame time must be >= 0, got ${command.time}`);
      }
      const targetTrackId = command.trackId ?? sourceTrack.id;
      let targetTrack = sourceTrack;
      if (command.trackId && command.trackId !== sourceTrack.id) {
        targetTrack = requireTrack(composition, command.trackId);
        requireTrackNotLocked(targetTrack);
        if (targetTrack.type !== 'video') {
          throw new CommandValidationError(
            `Preview frames are only supported on video tracks, got '${targetTrack.type}': ${command.trackId}`,
          );
        }
      }
      // Reject collision at the destination key (excluding self for in-track moves).
      const collision = targetTrack.previewFrames.some(
        pf => pf.id !== command.previewFrameId && pf.time === command.time,
      );
      if (collision) {
        throw new CommandValidationError(
          `Preview frame already exists at (track=${targetTrackId}, time=${command.time})`,
        );
      }
      return [makeEvent(envelope, 'composition:preview-frame-moved', {
        previewFrameId: command.previewFrameId,
        time: command.time,
        trackId: command.trackId,
        previousTime: previewFrame.time,
        previousTrackId: sourceTrack.id,
      })];
    }

    case 'composition:rebind-preview-frame': {
      const composition = requireComposition(compState);
      const { previewFrame, track } = requirePreviewFrame(composition, command.previewFrameId);
      requireTrackNotLocked(track);
      requireImageAsset(coreState, command.assetId);
      return [makeEvent(envelope, 'composition:preview-frame-rebound', {
        previewFrameId: command.previewFrameId,
        assetId: command.assetId,
        previousAssetId: previewFrame.assetId,
      })];
    }

    default:
      throw new CommandValidationError(`Unknown composition command: ${(command as CompositionCommand).type}`);
  }
}

// Agent ergonomic helper: builds either an add-preview-frame or rebind-preview-frame
// command, depending on whether a preview frame already exists at (trackId, time).
// Returns null when the existing preview frame already targets `assetId` (no-op).
//
// Not a command itself — pure utility, lives in user-space. Lets agents do
// "set the preview at this point to this asset" in one call without losing
// the 1:1 command/event purity at the protocol layer.
export function buildSetPreviewFrameCommand(
  composition: Composition,
  trackId: string,
  time: number,
  assetId: string,
): CompositionCommand | null {
  const track = composition.tracks.find(t => t.id === trackId);
  if (!track) return { type: 'composition:add-preview-frame', trackId, time, assetId };
  const existing = track.previewFrames.find(pf => pf.time === time);
  if (!existing) {
    return { type: 'composition:add-preview-frame', trackId, time, assetId };
  }
  if (existing.assetId === assetId) return null;
  return { type: 'composition:rebind-preview-frame', previewFrameId: existing.id, assetId };
}
