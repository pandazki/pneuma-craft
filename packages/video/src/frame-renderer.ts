import type {
  FrameRenderer,
  RenderedFrame,
  MediaDecoder,
  Compositor,
  CompositeLayer,
  SubtitleRenderer,
} from './types.js';
import type { Composition, ResolvedClip, ResolvedPreviewFrame } from '@pneuma-craft/timeline';
import { resolveFrame } from '@pneuma-craft/timeline';

export interface CreateFrameRendererOptions {
  readonly subtitleRenderer?: SubtitleRenderer;
  /**
   * Render preview frames in tracks where no real clip covers the current
   * time. Defaults to false — preview frames are a planning-layer visual
   * that should NOT appear in final exports unless explicitly requested.
   * Engines wire their own defaults: PlaybackEngine passes true, ExportEngine
   * passes false.
   */
  readonly includePreviewFrames?: boolean;
}

// Accept either the legacy positional SubtitleRenderer (pre-preview-frame
// callers) or the new options object. Internal callers (playback-engine,
// export-engine) and tests have been migrated to the options form.
type LegacyArg = SubtitleRenderer | CreateFrameRendererOptions | undefined;

function normalizeOptions(arg: LegacyArg): CreateFrameRendererOptions {
  if (arg === undefined) return {};
  if (typeof arg === 'function') return { subtitleRenderer: arg };
  return arg;
}

export function createFrameRenderer(
  decoder: MediaDecoder,
  compositor: Compositor,
  width: number,
  height: number,
  optionsOrLegacySubtitleRenderer?: LegacyArg,
): FrameRenderer {
  const options = normalizeOptions(optionsOrLegacySubtitleRenderer);
  const { subtitleRenderer, includePreviewFrames = false } = options;

  return {
    async renderFrame(composition: Composition, time: number): Promise<RenderedFrame> {
      const resolved = resolveFrame(composition, time);

      // Bucket per track for O(1) lookup. resolveFrame guarantees clips and
      // previewFrames are mutually exclusive per track, so we walk
      // composition.tracks once and pick at most one bucket per track.
      const clipsByTrack = new Map<string, ResolvedClip[]>();
      for (const rc of resolved.clips) {
        const arr = clipsByTrack.get(rc.track.id);
        if (arr) arr.push(rc); else clipsByTrack.set(rc.track.id, [rc]);
      }
      const previewByTrack = new Map<string, ResolvedPreviewFrame>();
      for (const rpf of resolved.previewFrames) previewByTrack.set(rpf.track.id, rpf);

      const layers: CompositeLayer[] = [];
      let zIndex = 0;

      // Video layers — iterate tracks in array order so z-stack matches
      // composition.tracks. Per-track decision: clip wins; preview is the
      // fallback only when allowed by the renderer's includePreviewFrames flag.
      for (const track of composition.tracks) {
        if (track.type !== 'video') continue;

        const trackClips = clipsByTrack.get(track.id);
        if (trackClips && trackClips.length > 0) {
          for (const rc of trackClips) {
            const source = await decoder.decodeVideoFrame(
              rc.clip.assetId, rc.localTime, width, height,
            );
            layers.push({ source, opacity: 1, zIndex: zIndex++ });
          }
          continue;
        }

        if (includePreviewFrames) {
          const rpf = previewByTrack.get(track.id);
          if (rpf) {
            // Image asset: decoder.decodeVideoFrame uses the cached-ImageBitmap
            // fast path and ignores the time argument.
            const source = await decoder.decodeVideoFrame(
              rpf.previewFrame.assetId, 0, width, height,
            );
            layers.push({ source, opacity: 1, zIndex: zIndex++ });
          }
        }
      }

      // Subtitles always composite on top of every video / preview layer,
      // regardless of track ordering in the composition. Track ordering
      // between multiple subtitle tracks is preserved.
      if (subtitleRenderer) {
        const subtitleClips = resolved.clips.filter(rc => rc.track.type === 'subtitle');
        for (const rc of subtitleClips) {
          const rendered = await subtitleRenderer({
            clip: rc.clip,
            localTime: rc.localTime,
            width,
            height,
          });
          if (rendered) {
            layers.push({ source: rendered, opacity: 1, zIndex: zIndex++ });
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
