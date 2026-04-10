import { useCallback, useEffect, useRef, useState } from 'react';
import { useComposition, usePlayback } from '@pneuma-craft/react';
import { assetResolver } from './asset-resolver';
import './NativePreview.css';

interface ClipInfo {
  readonly assetId: string;
  readonly startTime: number;
  readonly duration: number;
  readonly inPoint: number;
  readonly text?: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${ms}`;
}

function findClipAtTime(
  composition: { tracks: ReadonlyArray<{ type: string; clips: ReadonlyArray<ClipInfo> }> },
  time: number,
): ClipInfo | null {
  const videoTrack = composition.tracks.find((t) => t.type === 'video');
  if (!videoTrack) return null;
  for (const clip of videoTrack.clips) {
    if (time >= clip.startTime && time < clip.startTime + clip.duration) {
      return clip;
    }
  }
  return null;
}

/**
 * The single source of truth for "make the video element show the right frame".
 * Call this from ANY trigger: seek, tick, composition change, etc.
 */
function applyTimeToVideo(
  video: HTMLVideoElement,
  composition: { tracks: ReadonlyArray<{ type: string; clips: ReadonlyArray<ClipInfo> }> },
  time: number,
  prevClip: ClipInfo | null,
  isPlaying: boolean,
): { clip: ClipInfo | null; url: string } {
  const clip = findClipAtTime(composition, time);

  if (!clip) {
    video.pause();
    return { clip: null, url: '' };
  }

  const url = assetResolver.resolveUrl(clip.assetId);
  const fullUrl = new URL(url, window.location.href).href;
  const clipOffset = time - clip.startTime + clip.inPoint;

  // Determine if we need to update the video element
  const srcChanged = video.src !== fullUrl;
  const clipChanged = !prevClip
    || clip.assetId !== prevClip.assetId
    || clip.startTime !== prevClip.startTime;

  if (srcChanged) {
    video.src = url;
    video.currentTime = clipOffset;
    if (isPlaying) video.play().catch(() => {});
  } else if (clipChanged || !isPlaying) {
    // Same src but different clip region (after split), or paused seek
    if (Math.abs(video.currentTime - clipOffset) > 0.05) {
      video.currentTime = clipOffset;
    }
    if (isPlaying && video.paused) video.play().catch(() => {});
  }

  return { clip, url };
}

export function NativePreview() {
  const composition = useComposition();
  const { seek: storeSeek, currentTime: storeCurrentTime } = usePlayback();
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeClip, setActiveClip] = useState<ClipInfo | null>(null);
  const [activeUrl, setActiveUrl] = useState('');

  const playingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const activeClipRef = useRef<ClipInfo | null>(null);
  const compositionRef = useRef(composition);
  compositionRef.current = composition;
  const storeSeekRef = useRef(storeSeek);
  storeSeekRef.current = storeSeek;

  const totalDuration = composition?.duration ?? 0;

  // ── Unified seek: update time + video element ─────────────────────
  const seekTo = useCallback(
    (time: number) => {
      currentTimeRef.current = time;
      setCurrentTime(time);

      const comp = compositionRef.current;
      if (!comp) return;

      const clip = findClipAtTime(comp, time);
      const url = clip ? assetResolver.resolveUrl(clip.assetId) : '';

      // Always update state (so the video element gets rendered)
      activeClipRef.current = clip;
      setActiveClip(clip);
      setActiveUrl(url);

      // Update video element if it exists
      const video = videoRef.current;
      if (video && clip) {
        applyTimeToVideo(video, comp, time, activeClipRef.current, playingRef.current);
      }
    },
    [],
  );

  // ── React to external seeks (from Timeline click, etc.) ───────────
  useEffect(() => {
    // Skip if we're driving the time ourselves (during playback)
    if (playingRef.current) return;
    if (Math.abs(storeCurrentTime - currentTimeRef.current) > 0.01) {
      seekTo(storeCurrentTime);
    }
  }, [storeCurrentTime, seekTo]);

  // ── React to composition changes (split, move, add clip) ──────────
  useEffect(() => {
    if (!composition) return;
    seekTo(currentTimeRef.current);
  }, [composition, seekTo]);

  // ── rAF playback loop ─────────────────────────────────────────────
  const tick = useCallback(
    (timestamp: number) => {
      if (!playingRef.current) return;

      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = timestamp;
      }
      const delta = (timestamp - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = timestamp;

      const comp = compositionRef.current;
      const dur = comp?.duration ?? 0;
      let nextTime = currentTimeRef.current + delta;
      if (nextTime >= dur) nextTime = 0;

      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);
      storeSeekRef.current(nextTime);

      const video = videoRef.current;
      if (video && comp) {
        const { clip } = applyTimeToVideo(
          video, comp, nextTime, activeClipRef.current, true,
        );
        if (clip !== activeClipRef.current) {
          activeClipRef.current = clip;
          setActiveClip(clip);
          setActiveUrl(clip ? assetResolver.resolveUrl(clip.assetId) : '');
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    },
    [], // no deps — reads everything from refs
  );

  // ── Play / Pause ──────────────────────────────────────────────────
  const handlePlay = useCallback(() => {
    const video = videoRef.current;
    if (!compositionRef.current) return;

    if (playing) {
      setPlaying(false);
      playingRef.current = false;
      cancelAnimationFrame(rafRef.current);
      if (video) video.pause();
    } else {
      const dur = compositionRef.current.duration;
      if (currentTimeRef.current >= dur - 0.1) {
        seekTo(0);
        storeSeekRef.current(0);
      }

      setPlaying(true);
      playingRef.current = true;
      lastFrameTimeRef.current = 0;

      if (video && activeClipRef.current) {
        video.play().catch(() => {});
      }

      rafRef.current = requestAnimationFrame(tick);
    }
  }, [playing, seekTo, tick]);

  // ── Preview seekbar drag ──────────────────────────────────────────
  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      seekTo(time);
      storeSeekRef.current(time);
    },
    [seekTo],
  );

  // When video element mounts (activeUrl goes from '' → url), set its src
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeClipRef.current) return;
    const comp = compositionRef.current;
    if (!comp) return;
    applyTimeToVideo(video, comp, currentTimeRef.current, null, playingRef.current);
  }, [activeUrl]);

  // Cleanup
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <div className="native-preview">
      <div className="native-preview__viewport">
        {activeUrl ? (
          <video
            ref={videoRef}
            className="native-preview__video"
            playsInline
            muted
          />
        ) : (
          <div className="native-preview__empty">
            {composition ? 'No clip at current position' : 'No composition loaded'}
          </div>
        )}
      </div>

      <div className="native-preview__controls">
        <button
          className="native-preview__play-btn"
          onClick={handlePlay}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? '\u275A\u275A' : '\u25B6'}
        </button>

        <span className="native-preview__time">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>

        <input
          type="range"
          className="native-preview__seek"
          min={0}
          max={totalDuration || 1}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
        />

        {activeClip?.text && (
          <span className="native-preview__clip-label">
            {activeClip.text}
          </span>
        )}
      </div>
    </div>
  );
}
