import type {
  FrameRenderer,
  RenderedFrame,
  MediaDecoder,
  Compositor,
  CompositeLayer,
  SubtitleRenderer,
} from './types.js';
import type { Composition } from '@pneuma-craft/timeline';
import { resolveFrame } from '@pneuma-craft/timeline';

export function createFrameRenderer(
  decoder: MediaDecoder,
  compositor: Compositor,
  width: number,
  height: number,
  subtitleRenderer?: SubtitleRenderer,
): FrameRenderer {
  return {
    async renderFrame(composition: Composition, time: number): Promise<RenderedFrame> {
      const resolved = resolveFrame(composition, time);

      const videoClips = resolved.clips.filter(rc => rc.track.type === 'video');
      // Subtitle clips are skipped entirely when no renderer is wired up — this
      // preserves the pre-0.3 behavior for consumers that overlay subtitles
      // outside the compositor (e.g., as a DOM layer over the preview canvas).
      const subtitleClips = subtitleRenderer
        ? resolved.clips.filter(rc => rc.track.type === 'subtitle')
        : [];

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
          opacity: 1,
          zIndex: i,
        });
      }

      // Subtitles always composite on top of every video layer, regardless of
      // the track ordering in the composition. Track ordering between multiple
      // subtitle tracks is preserved.
      if (subtitleRenderer && subtitleClips.length > 0) {
        const baseZ = videoClips.length;
        for (let i = 0; i < subtitleClips.length; i++) {
          const rc = subtitleClips[i];
          const rendered = await subtitleRenderer({
            clip: rc.clip,
            localTime: rc.localTime,
            width,
            height,
          });
          if (rendered) {
            layers.push({
              source: rendered,
              opacity: 1,
              zIndex: baseZ + i,
            });
          }
        }
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
