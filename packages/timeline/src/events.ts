import type { Composition, Track, Clip } from './types.js';

interface CompositionCreatedEvent {
  readonly type: 'composition:created';
  readonly payload: { readonly composition: Composition };
}

interface CompositionTrackAddedEvent {
  readonly type: 'composition:track-added';
  readonly payload: { readonly track: Track };
}

interface CompositionTrackRemovedEvent {
  readonly type: 'composition:track-removed';
  readonly payload: { readonly trackId: string; readonly track: Track };
}

interface CompositionClipAddedEvent {
  readonly type: 'composition:clip-added';
  readonly payload: { readonly trackId: string; readonly clip: Clip };
}

interface CompositionClipRemovedEvent {
  readonly type: 'composition:clip-removed';
  readonly payload: { readonly clipId: string; readonly clip: Clip; readonly trackId: string };
}

interface CompositionClipMovedEvent {
  readonly type: 'composition:clip-moved';
  readonly payload: {
    readonly clipId: string;
    readonly startTime: number;
    readonly trackId: string | undefined;
    readonly previousStartTime: number;
    readonly previousTrackId: string;
  };
}

interface CompositionClipTrimmedEvent {
  readonly type: 'composition:clip-trimmed';
  readonly payload: {
    readonly clipId: string;
    readonly inPoint: number;
    readonly outPoint: number;
    readonly duration: number;
    readonly previousInPoint: number;
    readonly previousOutPoint: number;
    readonly previousDuration: number;
  };
}

interface CompositionClipSplitEvent {
  readonly type: 'composition:clip-split';
  readonly payload: {
    readonly clipId: string;
    readonly time: number;
    readonly newClipId: string;
    readonly leftClip: Clip;
    readonly rightClip: Clip;
    readonly originalClip: Clip;
  };
}

interface CompositionTracksReorderedEvent {
  readonly type: 'composition:tracks-reordered';
  readonly payload: {
    readonly trackIds: string[];
    readonly previousTrackIds: string[];
  };
}

export type CompositionEvent =
  | CompositionCreatedEvent
  | CompositionTrackAddedEvent
  | CompositionTrackRemovedEvent
  | CompositionClipAddedEvent
  | CompositionClipRemovedEvent
  | CompositionClipMovedEvent
  | CompositionClipTrimmedEvent
  | CompositionClipSplitEvent
  | CompositionTracksReorderedEvent;

export function asCompositionEvent(
  event: { type: string; payload: Record<string, unknown> },
): CompositionEvent {
  return event as CompositionEvent;
}
