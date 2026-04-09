import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOfflineAudioRenderer } from '../src/offline-audio-renderer.js';
import {
  createMockAudioBuffer,
  createMockComposition,
  createMockTrack,
  createMockClip,
  createMockAssetResolver,
} from './helpers.js';
import type { OfflineAudioRenderer } from '../src/types.js';

// ── Mock OfflineAudioContext ───────────────────────────────────────────────────

function createMockOfflineAudioContext(
  _channels: number,
  _length: number,
  sampleRate: number,
  renderedBuffer: AudioBuffer,
) {
  const mockGainNode = () => ({
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
  });

  const mockSourceNode = () => ({
    buffer: null as AudioBuffer | null,
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
  });

  return {
    destination: {},
    sampleRate,
    length: _length,
    createGain: vi.fn(mockGainNode),
    createBufferSource: vi.fn(mockSourceNode),
    startRendering: vi.fn().mockResolvedValue(renderedBuffer),
  };
}

describe('createOfflineAudioRenderer', () => {
  let renderer: OfflineAudioRenderer;
  let mockRenderedBuffer: AudioBuffer;
  let OfflineAudioContextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    renderer = createOfflineAudioRenderer();
    mockRenderedBuffer = createMockAudioBuffer(10, 48000);

    OfflineAudioContextMock = vi.fn().mockImplementation(
      (channels: number, length: number, sampleRate: number) =>
        createMockOfflineAudioContext(channels, length, sampleRate, mockRenderedBuffer),
    );

    vi.stubGlobal('OfflineAudioContext', OfflineAudioContextMock);
  });

  // ── 1. Empty composition ───────────────────────────────────────────────────

  describe('empty composition (no audio tracks)', () => {
    it('returns the rendered buffer without scheduling any clips', async () => {
      const composition = createMockComposition({ duration: 10 });
      const resolver = createMockAssetResolver();
      const decodeAudio = vi.fn();

      const result = await renderer.render(composition, resolver, decodeAudio);

      expect(result).toBe(mockRenderedBuffer);
      expect(decodeAudio).not.toHaveBeenCalled();
    });
  });

  // ── 2. Creates OfflineAudioContext with correct parameters ─────────────────

  describe('OfflineAudioContext instantiation', () => {
    it('uses channels=2, length=duration*sampleRate, and sampleRate from composition settings', async () => {
      const composition = createMockComposition({
        duration: 5,
        settings: {
          width: 1920,
          height: 1080,
          fps: 30,
          aspectRatio: '16:9',
          sampleRate: 44100,
        },
      });
      const resolver = createMockAssetResolver();

      await renderer.render(composition, resolver, vi.fn());

      expect(OfflineAudioContextMock).toHaveBeenCalledWith(
        2,
        Math.ceil(5 * 44100),
        44100,
      );
    });

    it('falls back to sampleRate=48000 when not specified in composition settings', async () => {
      const composition = createMockComposition({
        duration: 3,
        settings: {
          width: 1920,
          height: 1080,
          fps: 30,
          aspectRatio: '16:9',
          // sampleRate omitted
        } as never,
      });
      const resolver = createMockAssetResolver();

      await renderer.render(composition, resolver, vi.fn());

      expect(OfflineAudioContextMock).toHaveBeenCalledWith(
        2,
        Math.ceil(3 * 48000),
        48000,
      );
    });
  });

  // ── 3. Renders composition with audio clips ────────────────────────────────

  describe('audio clip scheduling', () => {
    it('calls decodeAudio for each clip and creates source + gain nodes', async () => {
      const clip = createMockClip({ id: 'clip-1', assetId: 'asset-1', startTime: 1, duration: 4, inPoint: 0 });
      const track = createMockTrack({ id: 'track-1', type: 'audio', muted: false, clips: [clip] });
      const composition = createMockComposition({ duration: 10, tracks: [track] });
      const resolver = createMockAssetResolver();
      const audioBuffer = createMockAudioBuffer(4, 48000);
      const decodeAudio = vi.fn().mockResolvedValue(audioBuffer);

      const result = await renderer.render(composition, resolver, decodeAudio);

      expect(decodeAudio).toHaveBeenCalledWith('asset-1');
      expect(result).toBe(mockRenderedBuffer);

      // OfflineAudioContext was created
      expect(OfflineAudioContextMock).toHaveBeenCalledTimes(1);
      const ctx = OfflineAudioContextMock.mock.results[0].value;

      // Source and gain nodes were created
      expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
      // Two gain nodes: clip gain + track gain
      expect(ctx.createGain).toHaveBeenCalledTimes(2);

      // startRendering was called
      expect(ctx.startRendering).toHaveBeenCalledTimes(1);
    });

    it('schedules source.start with correct (startTime, inPoint, duration)', async () => {
      const clip = createMockClip({
        id: 'clip-1',
        assetId: 'asset-1',
        startTime: 2,
        duration: 3,
        inPoint: 1,
      });
      const track = createMockTrack({ id: 'track-1', type: 'audio', muted: false, clips: [clip] });
      const composition = createMockComposition({ duration: 10, tracks: [track] });
      const resolver = createMockAssetResolver();
      const decodeAudio = vi.fn().mockResolvedValue(createMockAudioBuffer(5, 48000));

      await renderer.render(composition, resolver, decodeAudio);

      const ctx = OfflineAudioContextMock.mock.results[0].value;
      const sourceNode = ctx.createBufferSource.mock.results[0].value;

      expect(sourceNode.start).toHaveBeenCalledWith(2, 1, 3);
    });

    it('applies clip volume and track volume via gain nodes', async () => {
      const clip = createMockClip({
        id: 'clip-1',
        assetId: 'asset-1',
        startTime: 0,
        duration: 5,
        inPoint: 0,
        volume: 0.8,
      } as never);
      const track = createMockTrack({
        id: 'track-1',
        type: 'audio',
        muted: false,
        volume: 0.6,
        clips: [clip],
      });
      const composition = createMockComposition({ duration: 10, tracks: [track] });
      const resolver = createMockAssetResolver();
      const decodeAudio = vi.fn().mockResolvedValue(createMockAudioBuffer(5, 48000));

      await renderer.render(composition, resolver, decodeAudio);

      const ctx = OfflineAudioContextMock.mock.results[0].value;
      const [clipGain, trackGain] = ctx.createGain.mock.results.map((r: { value: { gain: { value: number } } }) => r.value);

      expect(clipGain.gain.value).toBe(0.8);
      expect(trackGain.gain.value).toBe(0.6);
    });
  });

  // ── 4. Skips muted tracks ──────────────────────────────────────────────────

  describe('muted tracks', () => {
    it('does not schedule clips from muted audio tracks', async () => {
      const clip = createMockClip({ id: 'clip-1', assetId: 'asset-1' });
      const track = createMockTrack({ id: 'track-1', type: 'audio', muted: true, clips: [clip] });
      const composition = createMockComposition({ duration: 10, tracks: [track] });
      const resolver = createMockAssetResolver();
      const decodeAudio = vi.fn();

      await renderer.render(composition, resolver, decodeAudio);

      expect(decodeAudio).not.toHaveBeenCalled();
      const ctx = OfflineAudioContextMock.mock.results[0].value;
      expect(ctx.createBufferSource).not.toHaveBeenCalled();
    });

    it('skips video tracks even when not muted', async () => {
      const clip = createMockClip({ id: 'clip-1', assetId: 'asset-1' });
      const track = createMockTrack({ id: 'track-1', type: 'video', muted: false, clips: [clip] });
      const composition = createMockComposition({ duration: 10, tracks: [track] });
      const resolver = createMockAssetResolver();
      const decodeAudio = vi.fn();

      await renderer.render(composition, resolver, decodeAudio);

      expect(decodeAudio).not.toHaveBeenCalled();
    });
  });

  // ── 5. Error resilience ────────────────────────────────────────────────────

  describe('error resilience', () => {
    it('skips a clip if decodeAudio throws and continues rendering', async () => {
      const clip1 = createMockClip({ id: 'clip-1', assetId: 'asset-1', startTime: 0, duration: 3 });
      const clip2 = createMockClip({ id: 'clip-2', assetId: 'asset-2', startTime: 3, duration: 3 });
      const track = createMockTrack({
        id: 'track-1',
        type: 'audio',
        muted: false,
        clips: [clip1, clip2],
      });
      const composition = createMockComposition({ duration: 10, tracks: [track] });
      const resolver = createMockAssetResolver();
      const goodBuffer = createMockAudioBuffer(3, 48000);
      const decodeAudio = vi.fn()
        .mockRejectedValueOnce(new Error('decode failed'))
        .mockResolvedValueOnce(goodBuffer);

      const result = await renderer.render(composition, resolver, decodeAudio);

      // Should still return a rendered buffer
      expect(result).toBe(mockRenderedBuffer);

      const ctx = OfflineAudioContextMock.mock.results[0].value;
      // Only one successful clip was scheduled
      expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    });
  });
});
