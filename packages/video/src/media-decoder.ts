import type { MediaDecoder, AssetResolver, MediaInfo } from './types.js';
import { Input, BlobSource, CanvasSink, AudioBufferSink, ALL_FORMATS } from 'mediabunny';

interface CachedAsset {
  input: InstanceType<typeof Input>;
  blob: Blob;
  videoSink: InstanceType<typeof CanvasSink> | null;
  imageBitmap: ImageBitmap | null;
  audioBuffer: AudioBuffer | null;
  mediaInfo: MediaInfo | null;
}

/**
 * Decodes an image blob and rasterizes it onto a (width × height) OffscreenCanvas
 * with "contain" fit (aspect-preserving scale, black letterbox). This matches the
 * CanvasSink's `fit: 'contain'` behavior so image layers and video layers share
 * the exact same output dimensions — important because the GPU compositor copies
 * external images into a texture of that exact size and rejects mismatches.
 */
async function decodeImageFitted(blob: Blob, width: number, height: number): Promise<ImageBitmap> {
  const raw = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context for image resize');
    const scale = Math.min(width / raw.width, height / raw.height);
    const drawW = raw.width * scale;
    const drawH = raw.height * scale;
    const dx = (width - drawW) / 2;
    const dy = (height - drawH) / 2;
    ctx.drawImage(raw, 0, 0, raw.width, raw.height, dx, dy, drawW, drawH);
    return await createImageBitmap(canvas);
  } finally {
    raw.close();
  }
}

export function createMediaDecoder(
  resolver: AssetResolver,
  audioContext: BaseAudioContext,
): MediaDecoder {
  const cache = new Map<string, CachedAsset>();
  const initPromises = new Map<string, Promise<CachedAsset>>();

  async function getOrCreateAsset(assetId: string): Promise<CachedAsset> {
    const existing = cache.get(assetId);
    if (existing) return existing;

    const pending = initPromises.get(assetId);
    if (pending) return pending;

    const promise = (async () => {
      const blob = await resolver.fetchBlob(assetId);
      const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const asset: CachedAsset = { input, blob, videoSink: null, imageBitmap: null, audioBuffer: null, mediaInfo: null };
      cache.set(assetId, asset);
      initPromises.delete(assetId);
      return asset;
    })();

    // Remove from initPromises on failure so future attempts can retry
    promise.catch(() => {
      initPromises.delete(assetId);
    });

    initPromises.set(assetId, promise);
    return promise;
  }

  return {
    async decodeVideoFrame(assetId, time, width, height) {
      const asset = await getOrCreateAsset(assetId);

      // Image fast path — cached ImageBitmap (already fitted to the target
      // dimensions), timestamp ignored. An image clip behaves as a static
      // frame that occupies its Clip's full duration.
      if (asset.imageBitmap) return asset.imageBitmap;

      if (!asset.videoSink) {
        let videoTrack: Awaited<ReturnType<typeof asset.input.getPrimaryVideoTrack>> | null = null;
        try {
          videoTrack = await asset.input.getPrimaryVideoTrack();
        } catch {
          // MediaBunny couldn't parse this blob as a media container — likely
          // a standalone image (png/jpg/webp/gif). Fall through to ImageBitmap.
        }
        if (!videoTrack) {
          try {
            asset.imageBitmap = await decodeImageFitted(asset.blob, width, height);
            return asset.imageBitmap;
          } catch (err) {
            throw new Error(
              `Asset ${assetId} has no video track and is not a decodable image: ${(err as Error).message}`,
            );
          }
        }
        asset.videoSink = new CanvasSink(videoTrack, { width, height, fit: 'contain', poolSize: 5 });
      }
      const result = await asset.videoSink.getCanvas(time);
      if (!result) throw new Error(`Failed to decode frame at ${time}s for asset ${assetId}`);
      return result.canvas;
    },

    async decodeAudio(assetId) {
      const asset = await getOrCreateAsset(assetId);
      if (asset.audioBuffer) return asset.audioBuffer;

      // Fast path: try browser-native decodeAudioData on the whole blob.
      // This works for standalone audio files (mp3/wav/flac/ogg/m4a) and is
      // much simpler and faster than iterating through MediaBunny packets.
      try {
        const arrayBuffer = await asset.blob.arrayBuffer();
        // decodeAudioData detaches the buffer, so pass a copy (slice(0) is cheap).
        const buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
        asset.audioBuffer = buffer;
        return buffer;
      } catch {
        // Fall through to MediaBunny path — typical for video containers whose
        // audio track the browser's decodeAudioData can't extract directly.
      }

      const audioTrack = await asset.input.getPrimaryAudioTrack();
      if (!audioTrack) throw new Error(`No audio track in asset ${assetId}`);

      // Iterate the full track via AudioBufferSink.buffers() and concatenate
      // into one AudioBuffer. getBuffer(0) alone only returns the first packet.
      const sink = new AudioBufferSink(audioTrack);
      const chunks: AudioBuffer[] = [];
      let totalFrames = 0;
      let sampleRate = 0;
      let numberOfChannels = 0;
      for await (const wrapped of sink.buffers()) {
        const buf = wrapped.buffer;
        chunks.push(buf);
        totalFrames += buf.length;
        if (!sampleRate) sampleRate = buf.sampleRate;
        if (!numberOfChannels) numberOfChannels = buf.numberOfChannels;
      }
      if (chunks.length === 0 || totalFrames === 0) {
        throw new Error(`Failed to decode audio for asset ${assetId}`);
      }

      const merged = audioContext.createBuffer(numberOfChannels, totalFrames, sampleRate);
      let offset = 0;
      for (const chunk of chunks) {
        for (let ch = 0; ch < numberOfChannels; ch++) {
          const src = chunk.getChannelData(Math.min(ch, chunk.numberOfChannels - 1));
          merged.copyToChannel(src, ch, offset);
        }
        offset += chunk.length;
      }
      asset.audioBuffer = merged;
      return merged;
    },

    async getMediaInfo(assetId) {
      const asset = await getOrCreateAsset(assetId);
      if (asset.mediaInfo) return asset.mediaInfo;
      const videoTrack = await asset.input.getPrimaryVideoTrack();
      const audioTrack = await asset.input.getPrimaryAudioTrack();
      const duration = await asset.input.computeDuration();
      let fps = 0;
      if (videoTrack) {
        const stats = await videoTrack.computePacketStats(100);
        fps = stats.averagePacketRate;
      }
      const info: MediaInfo = {
        duration,
        width: videoTrack?.displayWidth ?? 0,
        height: videoTrack?.displayHeight ?? 0,
        fps,
        hasVideo: videoTrack !== null,
        hasAudio: audioTrack !== null,
        videoCodec: videoTrack?.codec ?? null,
        audioCodec: audioTrack?.codec ?? null,
        sampleRate: audioTrack?.sampleRate ?? 0,
        channels: audioTrack?.numberOfChannels ?? 0,
      };
      asset.mediaInfo = info;
      return info;
    },

    destroy() {
      for (const asset of cache.values()) {
        asset.input.dispose();
        asset.imageBitmap?.close();
      }
      cache.clear();
      initPromises.clear();
    },
  };
}
