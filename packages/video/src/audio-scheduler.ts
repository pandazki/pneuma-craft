import type { AudioScheduler } from './types.js';
import type { Composition, Clip, Track } from '@pneuma-craft/timeline';

export interface AudioSchedulerOptions {
  audioContext: AudioContext;
}

interface ActiveSource {
  source: AudioBufferSourceNode;
  clipGain: GainNode;
}

export function createAudioScheduler(options: AudioSchedulerOptions): AudioScheduler {
  const { audioContext } = options;

  // Buffer storage: clipId → AudioBuffer
  const clipBuffers = new Map<string, AudioBuffer>();

  // Per-track gain nodes: trackId → GainNode
  const trackGains = new Map<string, GainNode>();

  // Per-track volume (separate from mute): trackId → volume
  const trackVolumes = new Map<string, number>();

  // Currently active sources
  let activeSources: ActiveSource[] = [];

  // Scheduler tick state for future clip scheduling
  let schedulerIntervalId: ReturnType<typeof setInterval> | null = null;
  let scheduledClipIds = new Set<string>();
  let playStartContextTime = 0;
  let playFromTime = 0;
  let currentComposition: Composition | null = null;

  // Look-ahead window in seconds
  const LOOK_AHEAD = 0.2;

  // Master gain node connected to destination
  const masterGain = audioContext.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(audioContext.destination);

  function getOrCreateTrackGain(track: Track): GainNode {
    let node = trackGains.get(track.id);
    if (!node) {
      node = audioContext.createGain();
      const vol = track.volume ?? 1;
      node.gain.value = track.muted ? 0 : vol;
      trackVolumes.set(track.id, vol);
      node.connect(masterGain);
      trackGains.set(track.id, node);
    }
    return node;
  }

  function clearSchedulerTick(): void {
    if (schedulerIntervalId !== null) {
      clearInterval(schedulerIntervalId);
      schedulerIntervalId = null;
    }
  }

  function stopAllSources(): void {
    for (const { source } of activeSources) {
      try {
        source.stop();
      } catch {
        // Source may already be stopped
      }
      source.disconnect();
    }
    activeSources = [];
  }

  function isClipActiveAt(clip: Clip, fromTime: number): boolean {
    return clip.startTime <= fromTime && fromTime < clip.startTime + clip.duration;
  }

  function scheduleClip(clip: Clip, track: Track, fromTime: number): void {
    const buffer = clipBuffers.get(clip.id);
    if (!buffer) return;

    const trackGain = getOrCreateTrackGain(track);

    // Create per-clip gain node
    const clipGain = audioContext.createGain();
    const clipVolume = clip.volume ?? 1;
    clipGain.gain.value = clipVolume;

    // Create source node
    const source = audioContext.createBufferSource();
    source.buffer = buffer;

    // Connect: source → clipGain → trackGain → masterGain → destination
    source.connect(clipGain);
    clipGain.connect(trackGain);

    // Calculate timing offsets
    const elapsed = fromTime - clip.startTime;
    const sourceOffset = clip.inPoint + elapsed;
    const remainingDuration = clip.duration - elapsed;

    const now = audioContext.currentTime;

    // Apply fade automations
    if (clip.fadeIn !== undefined && clip.fadeIn > 0) {
      const fadeInEnd = clip.startTime + clip.fadeIn;
      if (fromTime < fadeInEnd) {
        // Still within fade-in region
        const fadeElapsed = fromTime - clip.startTime;
        const currentLevel = fadeElapsed > 0 ? (fadeElapsed / clip.fadeIn) * clipVolume : 0;
        const fadeRemaining = clip.fadeIn - fadeElapsed;
        clipGain.gain.setValueAtTime(currentLevel, now);
        clipGain.gain.linearRampToValueAtTime(clipVolume, now + fadeRemaining);
      }
    }

    if (clip.fadeOut !== undefined && clip.fadeOut > 0) {
      const fadeOutStart = clip.startTime + clip.duration - clip.fadeOut;
      const fadeOutContextTime = now + Math.max(0, fadeOutStart - fromTime);
      clipGain.gain.setValueAtTime(clipVolume, fadeOutContextTime);
      clipGain.gain.linearRampToValueAtTime(0, fadeOutContextTime + clip.fadeOut);
    }

    source.start(0, sourceOffset, remainingDuration);

    activeSources.push({ source, clipGain });
  }

  function isClipInLookAhead(clip: Clip, currentTime: number, lookAhead: number): boolean {
    const clipEnd = clip.startTime + clip.duration;
    // Clip starts within the look-ahead window and hasn't ended
    return clip.startTime > currentTime && clip.startTime <= currentTime + lookAhead && clipEnd > currentTime;
  }

  function scheduleComposition(fromTime: number, composition: Composition): void {
    for (const track of composition.tracks) {
      if (track.type !== 'audio') continue;
      if (track.muted) continue;

      for (const clip of track.clips) {
        if (!isClipActiveAt(clip, fromTime)) continue;
        if (scheduledClipIds.has(clip.id)) continue;
        scheduledClipIds.add(clip.id);
        scheduleClip(clip, track, fromTime);
      }
    }
  }

  function startSchedulerTick(fromTime: number, composition: Composition): void {
    clearSchedulerTick();
    playStartContextTime = audioContext.currentTime;
    playFromTime = fromTime;
    currentComposition = composition;

    schedulerIntervalId = setInterval(() => {
      if (!currentComposition) return;
      const elapsed = audioContext.currentTime - playStartContextTime;
      const currentTimelineTime = playFromTime + elapsed;

      for (const track of currentComposition.tracks) {
        if (track.type !== 'audio') continue;
        if (track.muted) continue;

        for (const clip of track.clips) {
          if (scheduledClipIds.has(clip.id)) continue;
          if (isClipInLookAhead(clip, currentTimelineTime, LOOK_AHEAD) || isClipActiveAt(clip, currentTimelineTime)) {
            scheduledClipIds.add(clip.id);
            scheduleClip(clip, track, clip.startTime > currentTimelineTime ? clip.startTime : currentTimelineTime);
          }
        }
      }
    }, 100);
  }

  const scheduler: AudioScheduler = {
    get audioContext() {
      return audioContext;
    },

    loadClip(clipId: string, audioBuffer: AudioBuffer): void {
      clipBuffers.set(clipId, audioBuffer);
    },

    play(fromTime: number, composition: Composition): void {
      stopAllSources();
      clearSchedulerTick();
      scheduledClipIds = new Set();
      scheduleComposition(fromTime, composition);
      startSchedulerTick(fromTime, composition);
    },

    pause(): void {
      clearSchedulerTick();
      stopAllSources();
      scheduledClipIds = new Set();
    },

    seek(time: number, composition: Composition): void {
      clearSchedulerTick();
      stopAllSources();
      scheduledClipIds = new Set();
      scheduleComposition(time, composition);
      startSchedulerTick(time, composition);
    },

    setTrackVolume(trackId: string, volume: number): void {
      trackVolumes.set(trackId, volume);
      const node = trackGains.get(trackId);
      if (node) {
        node.gain.value = volume;
      }
    },

    setTrackMute(trackId: string, muted: boolean): void {
      const node = trackGains.get(trackId);
      if (node) {
        if (muted) {
          node.gain.value = 0;
        } else {
          const vol = trackVolumes.get(trackId) ?? 1;
          node.gain.value = vol;
        }
      }
    },

    destroy(): void {
      clearSchedulerTick();
      stopAllSources();
      scheduledClipIds = new Set();
      currentComposition = null;
      for (const node of trackGains.values()) {
        node.disconnect();
      }
      trackGains.clear();
      trackVolumes.clear();
      clipBuffers.clear();
      masterGain.disconnect();
    },
  };

  return scheduler;
}
