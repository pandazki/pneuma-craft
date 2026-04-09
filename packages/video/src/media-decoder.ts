import type { MediaDecoder, AssetResolver, MediaInfo } from './types.js';
import { Input, BlobSource, CanvasSink, AudioBufferSink, ALL_FORMATS } from 'mediabunny';

interface CachedAsset {
  input: InstanceType<typeof Input>;
  videoSink: InstanceType<typeof CanvasSink> | null;
  audioBuffer: AudioBuffer | null;
  mediaInfo: MediaInfo | null;
}

export function createMediaDecoder(resolver: AssetResolver): MediaDecoder {
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
      const asset: CachedAsset = { input, videoSink: null, audioBuffer: null, mediaInfo: null };
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
      if (!asset.videoSink) {
        const videoTrack = await asset.input.getPrimaryVideoTrack();
        if (!videoTrack) throw new Error(`No video track in asset ${assetId}`);
        asset.videoSink = new CanvasSink(videoTrack, { width, height, fit: 'contain', poolSize: 5 });
      }
      const result = await asset.videoSink.getCanvas(time);
      if (!result) throw new Error(`Failed to decode frame at ${time}s for asset ${assetId}`);
      return result.canvas;
    },

    async decodeAudio(assetId) {
      const asset = await getOrCreateAsset(assetId);
      if (asset.audioBuffer) return asset.audioBuffer;
      const audioTrack = await asset.input.getPrimaryAudioTrack();
      if (!audioTrack) throw new Error(`No audio track in asset ${assetId}`);
      const sink = new AudioBufferSink(audioTrack);
      const result = await sink.getBuffer(0);
      if (!result) throw new Error(`Failed to decode audio for asset ${assetId}`);
      asset.audioBuffer = result.buffer;
      return result.buffer;
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
      }
      cache.clear();
      initPromises.clear();
    },
  };
}
