import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockCanvasImageSource, createMockAudioBuffer } from './helpers.js';

// ── MediaBunny Mock Setup ──────────────────────────────────────────────

const mockVideoTrack = {
  displayWidth: 1920,
  displayHeight: 1080,
  codec: 'avc',
  computePacketStats: vi.fn().mockResolvedValue({ averagePacketRate: 30 }),
};

const mockAudioTrack = {
  sampleRate: 48000,
  numberOfChannels: 2,
  codec: 'aac',
};

const mockCanvas = createMockCanvasImageSource();
const mockCanvasSink = {
  getCanvas: vi.fn().mockResolvedValue({ canvas: mockCanvas, timestamp: 0, duration: 1 / 30 }),
};

const mockAudioBuffer = createMockAudioBuffer(10, 48000);
const mockAudioBufferSink = {
  getBuffer: vi.fn().mockResolvedValue({ buffer: mockAudioBuffer, timestamp: 0, duration: 10 }),
};

const mockInput = {
  getPrimaryVideoTrack: vi.fn().mockResolvedValue(mockVideoTrack),
  getPrimaryAudioTrack: vi.fn().mockResolvedValue(mockAudioTrack),
  computeDuration: vi.fn().mockResolvedValue(10),
  dispose: vi.fn(),
};

vi.mock('mediabunny', () => ({
  Input: vi.fn().mockImplementation(() => mockInput),
  BlobSource: vi.fn().mockImplementation((blob) => blob),
  CanvasSink: vi.fn().mockImplementation(() => mockCanvasSink),
  AudioBufferSink: vi.fn().mockImplementation(() => mockAudioBufferSink),
  ALL_FORMATS: [],
}));

// ── Tests ──────────────────────────────────────────────────────────────

import { createMediaDecoder } from '../src/media-decoder.js';
import type { AssetResolver } from '../src/types.js';
import { Input, BlobSource, CanvasSink, AudioBufferSink } from 'mediabunny';

function createMockResolver(overrides: Partial<AssetResolver> = {}): AssetResolver {
  return {
    resolveUrl: vi.fn().mockReturnValue('http://localhost/test.mp4'),
    fetchBlob: vi.fn().mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' })),
    ...overrides,
  };
}

describe('createMediaDecoder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations to defaults
    mockInput.getPrimaryVideoTrack.mockResolvedValue(mockVideoTrack);
    mockInput.getPrimaryAudioTrack.mockResolvedValue(mockAudioTrack);
    mockInput.computeDuration.mockResolvedValue(10);
    mockCanvasSink.getCanvas.mockResolvedValue({ canvas: mockCanvas, timestamp: 0, duration: 1 / 30 });
    mockAudioBufferSink.getBuffer.mockResolvedValue({ buffer: mockAudioBuffer, timestamp: 0, duration: 10 });
    mockVideoTrack.computePacketStats.mockResolvedValue({ averagePacketRate: 30 });
  });

  it('creates a decoder with an asset resolver', () => {
    const resolver = createMockResolver();
    const decoder = createMediaDecoder(resolver);
    expect(decoder).toBeDefined();
    expect(typeof decoder.decodeVideoFrame).toBe('function');
    expect(typeof decoder.decodeAudio).toBe('function');
    expect(typeof decoder.getMediaInfo).toBe('function');
    expect(typeof decoder.destroy).toBe('function');
  });

  it('decodes a video frame — calls fetchBlob, creates Input+CanvasSink, returns canvas', async () => {
    const resolver = createMockResolver();
    const decoder = createMediaDecoder(resolver);

    const result = await decoder.decodeVideoFrame('asset-1', 2.5, 1920, 1080);

    expect(resolver.fetchBlob).toHaveBeenCalledWith('asset-1');
    expect(BlobSource).toHaveBeenCalledOnce();
    expect(Input).toHaveBeenCalledOnce();
    expect(CanvasSink).toHaveBeenCalledWith(mockVideoTrack, { width: 1920, height: 1080, fit: 'contain', poolSize: 5 });
    expect(mockCanvasSink.getCanvas).toHaveBeenCalledWith(2.5);
    expect(result).toBe(mockCanvas);
  });

  it('caches Input per assetId — fetchBlob called only once for repeated decodes of same asset', async () => {
    const resolver = createMockResolver();
    const decoder = createMediaDecoder(resolver);

    await decoder.decodeVideoFrame('asset-1', 0, 1920, 1080);
    await decoder.decodeVideoFrame('asset-1', 1, 1920, 1080);
    await decoder.decodeVideoFrame('asset-1', 2, 1920, 1080);

    expect(resolver.fetchBlob).toHaveBeenCalledTimes(1);
    expect(Input).toHaveBeenCalledTimes(1);
  });

  it('creates separate Input for different assets', async () => {
    const resolver = createMockResolver();
    const decoder = createMediaDecoder(resolver);

    await decoder.decodeVideoFrame('asset-1', 0, 1920, 1080);
    await decoder.decodeVideoFrame('asset-2', 0, 1920, 1080);

    expect(resolver.fetchBlob).toHaveBeenCalledTimes(2);
    expect(resolver.fetchBlob).toHaveBeenCalledWith('asset-1');
    expect(resolver.fetchBlob).toHaveBeenCalledWith('asset-2');
    expect(Input).toHaveBeenCalledTimes(2);
  });

  it('decodes audio to AudioBuffer', async () => {
    const resolver = createMockResolver();
    const decoder = createMediaDecoder(resolver);

    const result = await decoder.decodeAudio('asset-1');

    expect(resolver.fetchBlob).toHaveBeenCalledWith('asset-1');
    expect(mockInput.getPrimaryAudioTrack).toHaveBeenCalled();
    expect(AudioBufferSink).toHaveBeenCalledWith(mockAudioTrack);
    expect(mockAudioBufferSink.getBuffer).toHaveBeenCalledWith(0);
    expect(result).toBe(mockAudioBuffer);
  });

  it('caches decoded AudioBuffer — getBuffer called only once for repeated decodeAudio calls', async () => {
    const resolver = createMockResolver();
    const decoder = createMediaDecoder(resolver);

    const result1 = await decoder.decodeAudio('asset-1');
    const result2 = await decoder.decodeAudio('asset-1');
    const result3 = await decoder.decodeAudio('asset-1');

    expect(mockAudioBufferSink.getBuffer).toHaveBeenCalledTimes(1);
    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  it('gets media info with correct duration, dimensions, fps, codecs', async () => {
    const resolver = createMockResolver();
    const decoder = createMediaDecoder(resolver);

    const info = await decoder.getMediaInfo('asset-1');

    expect(info.duration).toBe(10);
    expect(info.width).toBe(1920);
    expect(info.height).toBe(1080);
    expect(info.fps).toBe(30);
    expect(info.hasVideo).toBe(true);
    expect(info.hasAudio).toBe(true);
    expect(info.videoCodec).toBe('avc');
    expect(info.audioCodec).toBe('aac');
    expect(info.sampleRate).toBe(48000);
    expect(info.channels).toBe(2);
  });

  it('caches media info — computeDuration called only once', async () => {
    const resolver = createMockResolver();
    const decoder = createMediaDecoder(resolver);

    const info1 = await decoder.getMediaInfo('asset-1');
    const info2 = await decoder.getMediaInfo('asset-1');

    expect(mockInput.computeDuration).toHaveBeenCalledTimes(1);
    expect(info1).toBe(info2);
  });

  it('handles assets with no video track in getMediaInfo', async () => {
    mockInput.getPrimaryVideoTrack.mockResolvedValue(null);
    const resolver = createMockResolver();
    const decoder = createMediaDecoder(resolver);

    const info = await decoder.getMediaInfo('asset-audio-only');

    expect(info.hasVideo).toBe(false);
    expect(info.width).toBe(0);
    expect(info.height).toBe(0);
    expect(info.fps).toBe(0);
    expect(info.videoCodec).toBeNull();
    expect(info.hasAudio).toBe(true);
  });

  it('throws when decoding video frame from asset with no video track', async () => {
    mockInput.getPrimaryVideoTrack.mockResolvedValue(null);
    const resolver = createMockResolver();
    const decoder = createMediaDecoder(resolver);

    await expect(decoder.decodeVideoFrame('asset-audio-only', 0, 1920, 1080)).rejects.toThrow(
      'No video track in asset asset-audio-only',
    );
  });

  it('throws when decoding audio from asset with no audio track', async () => {
    mockInput.getPrimaryAudioTrack.mockResolvedValue(null);
    const resolver = createMockResolver();
    const decoder = createMediaDecoder(resolver);

    await expect(decoder.decodeAudio('asset-video-only')).rejects.toThrow(
      'No audio track in asset asset-video-only',
    );
  });

  it('destroy releases all resources by calling dispose on each input', async () => {
    const resolver = createMockResolver();
    const decoder = createMediaDecoder(resolver);

    // Load two different assets
    await decoder.decodeVideoFrame('asset-1', 0, 1920, 1080);
    await decoder.decodeVideoFrame('asset-2', 0, 1920, 1080);

    decoder.destroy();

    expect(mockInput.dispose).toHaveBeenCalledTimes(2);
  });

  it('handles concurrent requests for the same asset without duplicate fetchBlob calls', async () => {
    const resolver = createMockResolver();
    const decoder = createMediaDecoder(resolver);

    // Fire three concurrent requests for the same asset
    const [r1, r2, r3] = await Promise.all([
      decoder.decodeVideoFrame('asset-1', 0, 1920, 1080),
      decoder.decodeVideoFrame('asset-1', 1, 1920, 1080),
      decoder.decodeVideoFrame('asset-1', 2, 1920, 1080),
    ]);

    expect(resolver.fetchBlob).toHaveBeenCalledTimes(1);
    expect(r1).toBe(mockCanvas);
    expect(r2).toBe(mockCanvas);
    expect(r3).toBe(mockCanvas);
  });
});
