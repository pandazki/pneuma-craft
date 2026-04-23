import type { OfflineAudioRenderer } from './types.js';
import type { Clip, Track } from '@pneuma-craft/timeline';

export function createOfflineAudioRenderer(): OfflineAudioRenderer {
  return {
    async render(composition, _resolver, decodeAudio) {
      const sampleRate = composition.settings.sampleRate ?? 48000;
      const channels = 2;
      const duration = composition.duration;
      const length = Math.ceil(duration * sampleRate);

      const offlineCtx = new OfflineAudioContext(channels, length, sampleRate);

      // Collect clips from every unmuted media track. Video clips contribute
      // their embedded audio exactly like standalone audio clips — this is
      // what keeps the exported audio in lockstep with what the preview
      // plays. Subtitle/other non-media tracks are skipped.
      const audioClips: Array<{ clip: Clip; track: Track }> = [];
      for (const track of composition.tracks) {
        if (track.type !== 'audio' && track.type !== 'video') continue;
        if (track.muted) continue;
        for (const clip of track.clips) {
          audioClips.push({ clip, track });
        }
      }

      // Schedule each clip
      for (const { clip, track } of audioClips) {
        let buffer: AudioBuffer;
        try {
          buffer = await decodeAudio(clip.assetId);
        } catch {
          // Clip has no audio stream (image asset, silent video) or decode
          // failed. Skip silently — video-track clips routinely have no
          // audio, so a warning here would be noise. True decode failures
          // on audio assets surface via the preview path instead.
          continue;
        }

        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;

        const clipGain = offlineCtx.createGain();
        const clipVolume = clip.volume ?? 1;
        clipGain.gain.value = clipVolume;

        const trackGain = offlineCtx.createGain();
        trackGain.gain.value = track.volume;

        source.connect(clipGain);
        clipGain.connect(trackGain);
        trackGain.connect(offlineCtx.destination);

        // Fade automation
        const fadeIn = clip.fadeIn;
        const fadeOut = clip.fadeOut;

        if (fadeIn && fadeIn > 0) {
          clipGain.gain.setValueAtTime(0, clip.startTime);
          clipGain.gain.linearRampToValueAtTime(clipVolume, clip.startTime + fadeIn);
        }

        if (fadeOut && fadeOut > 0) {
          const fadeOutStart = clip.startTime + clip.duration - fadeOut;
          clipGain.gain.setValueAtTime(clipVolume, fadeOutStart);
          clipGain.gain.linearRampToValueAtTime(0, clip.startTime + clip.duration);
        }

        source.start(clip.startTime, clip.inPoint, clip.duration);
      }

      return offlineCtx.startRendering();
    },
  };
}
