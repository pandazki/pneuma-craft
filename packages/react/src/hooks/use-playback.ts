import { useShallow } from 'zustand/react/shallow';
import type { PlaybackState } from '@pneuma-craft/video';
import { usePneumaCraftStore } from '../context.js';

export interface PlaybackHookState {
  readonly state: PlaybackState;
  readonly currentTime: number;
  readonly duration: number;
  readonly playbackRate: number;
  readonly loop: { start: number; end: number } | null;
  readonly play: () => void;
  readonly pause: () => void;
  readonly seek: (time: number) => void;
  readonly setPlaybackRate: (rate: number) => void;
  readonly setLoop: (loop: { start: number; end: number } | null) => void;
}

export function usePlayback(): PlaybackHookState {
  return usePneumaCraftStore(
    useShallow((s) => ({
      state: s.playbackState,
      currentTime: s.currentTime,
      duration: s.duration,
      playbackRate: s.playbackRate,
      loop: s.loop,
      play: s.play,
      pause: s.pause,
      seek: s.seek,
      setPlaybackRate: s.setPlaybackRate,
      setLoop: s.setLoop,
    })),
  );
}
