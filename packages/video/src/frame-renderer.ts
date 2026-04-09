import type { FrameRenderer, RenderedFrame, MediaDecoder, Compositor, CompositeLayer } from './types.js';
import type { Composition } from '@pneuma-craft/timeline';
import { resolveFrame } from '@pneuma-craft/timeline';

export function createFrameRenderer(
  decoder: MediaDecoder,
  compositor: Compositor,
  width: number,
  height: number,
): FrameRenderer {
  return {
    async renderFrame(composition: Composition, time: number): Promise<RenderedFrame> {
      const resolved = resolveFrame(composition, time);

      // Only render video/image clips (skip audio, subtitle)
      const videoClips = resolved.clips.filter(
        rc => rc.track.type === 'video',
      );

      const layers: CompositeLayer[] = [];

      for (let i = 0; i < videoClips.length; i++) {
        const rc = videoClips[i];
        const source = await decoder.decodeVideoFrame(
          rc.clip.assetId,
          rc.localTime,
          width,
          height,
        );
        layers.push({
          source,
          opacity: rc.clip.volume ?? 1,
          zIndex: i,
        });
      }

      const image = await compositor.composite(layers);

      return { image, time, width, height };
    },

    destroy(): void {
      decoder.destroy();
      compositor.destroy();
    },
  };
}
