import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockCanvasImageSource, createMockAudioBuffer, createMockAudioContext } from './helpers.js';

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
// Simulate mediabunny's AudioBufferSink.buffers() async iterator yielding a
// sequence of small chunks that the decoder concatenates.
const makeSinkChunks = () => [
  { buffer: createMockAudioBuffer(5, 48000) },
  { buffer: createMockAudioBuffer(5, 48000) },
];
const mockAudioBufferSink = {
  getBuffer: vi.fn().mockResolvedValue({ buffer: mockAudioBuffer, timestamp: 0, duration: 10 }),
  buffers: vi.fn().mockImplementation(async function* () {
    for (const c of makeSinkChunks()) yield c;
  }),
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
    const audioContext = createMockAudioContext();
    const decoder = createMediaDecoder(resolver, audioContext);
    expect(decoder).toBeDefined();
    expect(typeof decoder.decodeVideoFrame).toBe('function');
    expect(typeof decoder.decodeAudio).toBe('function');
    expect(typeof decoder.getMediaInfo).toBe('function');
    expect(typeof decoder.destroy).toBe('function');
  });

  it('decodes a video frame — calls fetchBlob, creates Input+CanvasSink, returns canvas', async () => {
    const resolver = createMockResolver();
    const audioContext = createMockAudioContext();
    const decoder = createMediaDecoder(resolver, audioContext);

    const result = await decoder.decodeVideoFrame('asset-1', 2.5, 1920, 1080);

    expect(resolver.fetchBlob).toHaveBeenCalledWith('asset-1');
    expect(BlobSource).toHaveBeenCalledOnce();
    expect(Input).toHaveBeenCalledOnce();
    expect(CanvasSink).toHaveBeenCalledWith(mockVideoTrack, {
      width: 1920,
      height: 1080,
      fit: 'contain',
      poolSize: 5,
      alpha: true,
    });
    expect(mockCanvasSink.getCanvas).toHaveBeenCalledWith(2.5);
    expect(result).toBe(mockCanvas);
  });

  it('caches Input per assetId — fetchBlob called only once for repeated decodes of same asset', async () => {
    const resolver = createMockResolver();
    const audioContext = createMockAudioContext();
    const decoder = createMediaDecoder(resolver, audioContext);

    await decoder.decodeVideoFrame('asset-1', 0, 1920, 1080);
    await decoder.decodeVideoFrame('asset-1', 1, 1920, 1080);
    await decoder.decodeVideoFrame('asset-1', 2, 1920, 1080);

    expect(resolver.fetchBlob).toHaveBeenCalledTimes(1);
    expect(Input).toHaveBeenCalledTimes(1);
  });

  it('creates separate Input for different assets', async () => {
    const resolver = createMockResolver();
    const audioContext = createMockAudioContext();
    const decoder = createMediaDecoder(resolver, audioContext);

    await decoder.decodeVideoFrame('asset-1', 0, 1920, 1080);
    await decoder.decodeVideoFrame('asset-2', 0, 1920, 1080);

    expect(resolver.fetchBlob).toHaveBeenCalledTimes(2);
    expect(resolver.fetchBlob).toHaveBeenCalledWith('asset-1');
    expect(resolver.fetchBlob).toHaveBeenCalledWith('asset-2');
    expect(Input).toHaveBeenCalledTimes(2);
  });

  it('decodes audio via fast path (audioContext.decodeAudioData) when blob is a standalone audio file', async () => {
    const resolver = createMockResolver();
    const audioContext = createMockAudioContext();
    const fastPathBuffer = createMockAudioBuffer(30, 48000);
    (audioContext.decodeAudioData as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fastPathBuffer);
    const decoder = createMediaDecoder(resolver, audioContext);

    const result = await decoder.decodeAudio('asset-1');

    expect(resolver.fetchBlob).toHaveBeenCalledWith('asset-1');
    expect(audioContext.decodeAudioData).toHaveBeenCalledTimes(1);
    // Fast path must return the full-file buffer without touching MediaBunny.
    expect(AudioBufferSink).not.toHaveBeenCalled();
    expect(result).toBe(fastPathBuffer);
  });

  it('falls back to AudioBufferSink.buffers() iteration when decodeAudioData rejects', async () => {
    const resolver = createMockResolver();
    const audioContext = createMockAudioContext();
    // default mock: decodeAudioData rejects → fallback kicks in
    const decoder = createMediaDecoder(resolver, audioContext);

    const result = await decoder.decodeAudio('asset-1');

    expect(audioContext.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(AudioBufferSink).toHaveBeenCalledWith(mockAudioTrack);
    // Must iterate the full track (not just getBuffer(0)).
    expect(mockAudioBufferSink.buffers).toHaveBeenCalled();
    expect(audioContext.createBuffer).toHaveBeenCalled();
    // Concatenated buffer length = sum of chunk lengths (two 5s chunks at 48k)
    expect(result.length).toBe(5 * 48000 + 5 * 48000);
  });

  it('caches decoded AudioBuffer — repeat decodeAudio calls hit cache', async () => {
    const resolver = createMockResolver();
    const audioContext = createMockAudioContext();
    const fastPathBuffer = createMockAudioBuffer(30, 48000);
    (audioContext.decodeAudioData as ReturnType<typeof vi.fn>).mockResolvedValue(fastPathBuffer);
    const decoder = createMediaDecoder(resolver, audioContext);

    const result1 = await decoder.decodeAudio('asset-1');
    const result2 = await decoder.decodeAudio('asset-1');
    const result3 = await decoder.decodeAudio('asset-1');

    // decodeAudioData runs once; subsequent calls return cached buffer.
    expect(audioContext.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  it('gets media info with correct duration, dimensions, fps, codecs', async () => {
    const resolver = createMockResolver();
    const audioContext = createMockAudioContext();
    const decoder = createMediaDecoder(resolver, audioContext);

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
    const audioContext = createMockAudioContext();
    const decoder = createMediaDecoder(resolver, audioContext);

    const info1 = await decoder.getMediaInfo('asset-1');
    const info2 = await decoder.getMediaInfo('asset-1');

    expect(mockInput.computeDuration).toHaveBeenCalledTimes(1);
    expect(info1).toBe(info2);
  });

  it('handles assets with no video track in getMediaInfo', async () => {
    mockInput.getPrimaryVideoTrack.mockResolvedValue(null);
    const resolver = createMockResolver();
    const audioContext = createMockAudioContext();
    const decoder = createMediaDecoder(resolver, audioContext);

    const info = await decoder.getMediaInfo('asset-audio-only');

    expect(info.hasVideo).toBe(false);
    expect(info.width).toBe(0);
    expect(info.height).toBe(0);
    expect(info.fps).toBe(0);
    expect(info.videoCodec).toBeNull();
    expect(info.hasAudio).toBe(true);
  });

  it('throws when decoding video frame from asset with no video track and image decode also fails', async () => {
    mockInput.getPrimaryVideoTrack.mockResolvedValue(null);
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('not an image')));
    const resolver = createMockResolver();
    const audioContext = createMockAudioContext();
    const decoder = createMediaDecoder(resolver, audioContext);

    await expect(decoder.decodeVideoFrame('asset-audio-only', 0, 1920, 1080)).rejects.toThrow(
      /asset-audio-only/,
    );
    vi.unstubAllGlobals();
  });

  // ── Image fast path ─────────────────────────────────────────────────────

  // Image fast path requires OffscreenCanvas (for contain-fit resize) and
  // createImageBitmap called twice per decode: once on the blob (raw),
  // once on the resized canvas (final).
  function stubImagePipeline() {
    const rawBitmap = { width: 1920, height: 1080, close: vi.fn() } as unknown as ImageBitmap;
    const finalBitmap = { width: 960, height: 540, close: vi.fn() } as unknown as ImageBitmap;
    const drawImage = vi.fn();
    const ctx = { drawImage };
    const canvas = { width: 0, height: 0, getContext: vi.fn().mockReturnValue(ctx) };
    vi.stubGlobal('OffscreenCanvas', vi.fn().mockImplementation((w: number, h: number) => {
      canvas.width = w; canvas.height = h;
      return canvas;
    }));
    const createImageBitmapSpy = vi.fn().mockImplementation(async (source: unknown) => {
      return source instanceof Blob ? rawBitmap : finalBitmap;
    });
    vi.stubGlobal('createImageBitmap', createImageBitmapSpy);
    return { rawBitmap, finalBitmap, drawImage, createImageBitmapSpy };
  }

  it('decodes image asset via createImageBitmap + contain-fit resize', async () => {
    mockInput.getPrimaryVideoTrack.mockResolvedValue(null);
    const { finalBitmap, drawImage, createImageBitmapSpy } = stubImagePipeline();

    const resolver = createMockResolver({
      fetchBlob: vi.fn().mockResolvedValue(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })),
    });
    const audioContext = createMockAudioContext();
    const decoder = createMediaDecoder(resolver, audioContext);

    const result = await decoder.decodeVideoFrame('image-1', 0, 960, 540);

    // Final bitmap is the one fitted to the target canvas dimensions.
    expect(result).toBe(finalBitmap);
    // Called twice: once on blob (raw), once on resized canvas (final).
    expect(createImageBitmapSpy).toHaveBeenCalledTimes(2);
    // Contain-fit math: raw 1920x1080 → scale 0.5 → 960x540 → centered at (0,0)
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(), 0, 0, 1920, 1080, 0, 0, 960, 540,
    );
    // Image decoding must not touch CanvasSink
    expect(CanvasSink).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('requests an alpha-enabled 2D context when fitting images — PNG transparency must survive the letterbox pass', async () => {
    mockInput.getPrimaryVideoTrack.mockResolvedValue(null);
    const { createImageBitmapSpy: _spy } = stubImagePipeline();
    void _spy;

    // Re-stub OffscreenCanvas with a getContext spy we can introspect.
    const getContextSpy = vi.fn().mockReturnValue({ drawImage: vi.fn() });
    vi.stubGlobal('OffscreenCanvas', vi.fn().mockImplementation((w: number, h: number) => ({
      width: w,
      height: h,
      getContext: getContextSpy,
    })));

    const resolver = createMockResolver({
      fetchBlob: vi.fn().mockResolvedValue(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })),
    });
    const audioContext = createMockAudioContext();
    const decoder = createMediaDecoder(resolver, audioContext);

    await decoder.decodeVideoFrame('image-1', 0, 960, 540);

    // Must pass { alpha: true } — default (alpha: true is nominal default, but
    // explicit `{ alpha: true }` is required because some browsers / tooling
    // use an opaque backing store unless explicitly opted in, which would
    // flatten a PNG's transparent pixels to black during the contain-fit pass.
    expect(getContextSpy).toHaveBeenCalledWith('2d', { alpha: true });

    vi.unstubAllGlobals();
  });

  it('caches fitted ImageBitmap — returns same bitmap at any timestamp', async () => {
    mockInput.getPrimaryVideoTrack.mockResolvedValue(null);
    const { finalBitmap, createImageBitmapSpy } = stubImagePipeline();

    const resolver = createMockResolver({
      fetchBlob: vi.fn().mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'image/png' })),
    });
    const audioContext = createMockAudioContext();
    const decoder = createMediaDecoder(resolver, audioContext);

    const r1 = await decoder.decodeVideoFrame('image-1', 0, 960, 540);
    const r2 = await decoder.decodeVideoFrame('image-1', 3.5, 960, 540);
    const r3 = await decoder.decodeVideoFrame('image-1', 10, 960, 540);

    // Decoded once (2 createImageBitmap calls — blob + canvas), then cache hits.
    expect(createImageBitmapSpy).toHaveBeenCalledTimes(2);
    expect(r1).toBe(finalBitmap);
    expect(r2).toBe(finalBitmap);
    expect(r3).toBe(finalBitmap);

    vi.unstubAllGlobals();
  });

  it('throws when decoding audio from asset with no audio track', async () => {
    mockInput.getPrimaryAudioTrack.mockResolvedValue(null);
    const resolver = createMockResolver();
    const audioContext = createMockAudioContext();
    const decoder = createMediaDecoder(resolver, audioContext);

    await expect(decoder.decodeAudio('asset-video-only')).rejects.toThrow(
      'No audio track in asset asset-video-only',
    );
  });

  it('destroy releases all resources by calling dispose on each input', async () => {
    const resolver = createMockResolver();
    const audioContext = createMockAudioContext();
    const decoder = createMediaDecoder(resolver, audioContext);

    // Load two different assets
    await decoder.decodeVideoFrame('asset-1', 0, 1920, 1080);
    await decoder.decodeVideoFrame('asset-2', 0, 1920, 1080);

    decoder.destroy();

    expect(mockInput.dispose).toHaveBeenCalledTimes(2);
  });

  it('retries after a failed fetchBlob instead of caching the rejection', async () => {
    let callCount = 0;
    const resolver = createMockResolver({
      fetchBlob: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Network error');
        }
        return new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' });
      }),
    });
    const audioContext = createMockAudioContext();
    const decoder = createMediaDecoder(resolver, audioContext);

    // First attempt should fail
    await expect(decoder.decodeVideoFrame('asset-fail', 0, 1920, 1080)).rejects.toThrow('Network error');

    // Second attempt should succeed (not return the cached rejection)
    const result = await decoder.decodeVideoFrame('asset-fail', 0, 1920, 1080);
    expect(result).toBe(mockCanvas);
    expect(resolver.fetchBlob).toHaveBeenCalledTimes(2);
  });

  it('handles concurrent requests for the same asset without duplicate fetchBlob calls', async () => {
    const resolver = createMockResolver();
    const audioContext = createMockAudioContext();
    const decoder = createMediaDecoder(resolver, audioContext);

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
