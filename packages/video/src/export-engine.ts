import type { ExportEngine, ExportOptions, AssetResolver, SubtitleRenderer } from './types.js';
import type { Composition } from '@pneuma-craft/timeline';
import { createMediaDecoder } from './media-decoder.js';
import { createCompositor } from './compositor.js';
import { createFrameRenderer } from './frame-renderer.js';
import { createOfflineAudioRenderer } from './offline-audio-renderer.js';
import {
  Output,
  CanvasSource,
  AudioBufferSource,
  Mp4OutputFormat,
  WebMOutputFormat,
  BufferTarget,
} from 'mediabunny';

export interface ExportEngineOptions {
  /**
   * Optional rasterizer for subtitle-track clips. Pass the same renderer used
   * by `createPlaybackEngine` so the exported video is pixel-identical to the
   * preview. When omitted, subtitle tracks are skipped during export.
   */
  subtitleRenderer?: SubtitleRenderer;
}

export function createExportEngine(options?: ExportEngineOptions): ExportEngine {
  const subtitleRenderer = options?.subtitleRenderer;
  const progressListeners = new Set<(progress: number) => void>();
  let abortController: AbortController | null = null;

  function notifyProgress(progress: number): void {
    for (const cb of progressListeners) {
      try { cb(progress); } catch (e) { console.error('[ExportEngine]', e); }
    }
  }

  return {
    async export(
      composition: Composition,
      options: ExportOptions,
      resolver: AssetResolver,
    ): Promise<Blob> {
      abortController = new AbortController();
      const signal = abortController.signal;

      const fps = options.fps ?? composition.settings.fps;
      const width = options.width ?? composition.settings.width;
      const height = options.height ?? composition.settings.height;
      const totalFrames = Math.ceil(composition.duration * fps);

      // Minimal OfflineAudioContext used only for decodeAudioData during asset
      // decoding (export has its own offline context for actual audio rendering).
      const decoderAudioCtx = new OfflineAudioContext(1, 1, composition.settings.sampleRate || 48000);
      const decoder = createMediaDecoder(resolver, decoderAudioCtx);
      const compositor = await createCompositor(width, height, 'canvas2d');
      const renderer = createFrameRenderer(decoder, compositor, width, height, subtitleRenderer);

      try {
        const format = options.format === 'webm'
          ? new WebMOutputFormat()
          : new Mp4OutputFormat({ fastStart: 'in-memory' });

        const target = new BufferTarget();
        const output = new Output({ format, target });

        const renderCanvas = new OffscreenCanvas(width, height);
        const videoSource = new CanvasSource(renderCanvas, {
          codec: options.videoCodec,
          bitrate: options.videoBitrate,
        });

        const audioSource = new AudioBufferSource({
          codec: options.audioCodec,
          bitrate: options.audioBitrate,
        });

        output.addVideoTrack(videoSource);
        output.addAudioTrack(audioSource);
        await output.start();

        // Render video frames
        const renderCtx = renderCanvas.getContext('2d')!;

        for (let frame = 0; frame < totalFrames; frame++) {
          if (signal.aborted) throw new Error('Export aborted');

          const time = frame / fps;
          const rendered = await renderer.renderFrame(composition, time);

          renderCtx.clearRect(0, 0, width, height);
          renderCtx.drawImage(rendered.image, 0, 0, width, height);
          rendered.image.close();

          await videoSource.add(time, 1 / fps);

          if ((frame + 1) % 5 === 0 || frame === totalFrames - 1) {
            notifyProgress((frame + 1) / totalFrames);
          }

          // Yield to event loop periodically
          if ((frame + 1) % 5 === 0) {
            await new Promise(r => setTimeout(r, 0));
          }
        }

        videoSource.close();
        if (signal.aborted) throw new Error('Export aborted');

        // Render audio offline
        const offlineRenderer = createOfflineAudioRenderer();
        const audioBuffer = await offlineRenderer.render(
          composition,
          resolver,
          (assetId) => decoder.decodeAudio(assetId),
        );
        if (signal.aborted) throw new Error('Export aborted');

        await audioSource.add(audioBuffer);
        audioSource.close();
        if (signal.aborted) throw new Error('Export aborted');

        await output.finalize();

        const buffer = target.buffer;
        if (!buffer) throw new Error('Export produced no output');

        const mimeType = options.format === 'webm' ? 'video/webm' : 'video/mp4';
        return new Blob([buffer], { type: mimeType });
      } finally {
        renderer.destroy();
        abortController = null;
      }
    },

    onProgress(cb: (progress: number) => void): () => void {
      progressListeners.add(cb);
      return () => { progressListeners.delete(cb); };
    },

    abort(): void {
      abortController?.abort();
    },
  };
}
