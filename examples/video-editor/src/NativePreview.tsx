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

/**
 * Find the video clip at the given composition time.
 */
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

export function NativePreview() {
  const composition = useComposition();
  const { seek: storeSeek, currentTime: storeCurrentTime } = usePlayback();
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeClip, setActiveClip] = useState<ClipInfo | null>(null);
  const [activeUrl, setActiveUrl] = useState('');

  // Keep refs for rAF callback
  const playingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const storeSeekRef = useRef(storeSeek);
  storeSeekRef.current = storeSeek;

  const totalDuration = composition?.duration ?? 0;

  // React to external seeks (e.g. from Timeline click) when not playing
  useEffect(() => {
    if (playingRef.current) return;
    if (Math.abs(storeCurrentTime - currentTimeRef.current) > 0.15) {
      currentTimeRef.current = storeCurrentTime;
      setCurrentTime(storeCurrentTime);
      // syncClip will be called by the effect below
    }
  }, [storeCurrentTime]);

  // Sync clip with current time
  const syncClip = useCallback(
    (time: number) => {
      if (!composition) return;
      const clip = findClipAtTime(composition, time);
      if (clip && clip.assetId !== activeClip?.assetId) {
        const url = assetResolver.resolveUrl(clip.assetId);
        setActiveClip(clip);
        setActiveUrl(url);
      } else if (!clip && activeClip) {
        setActiveClip(null);
        setActiveUrl('');
      }
    },
    [composition, activeClip],
  );

  // When clip changes or time updates, seek the video element to the right offset
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeClip) return;

    const clipOffset = currentTime - activeClip.startTime + activeClip.inPoint;
    // Only seek if the difference is significant (avoid constant seeking during playback)
    if (!playing && Math.abs(video.currentTime - clipOffset) > 0.1) {
      video.currentTime = clipOffset;
    }
  }, [activeClip, currentTime, playing]);

  // Handle video src changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeUrl) return;

    if (video.src !== new URL(activeUrl, window.location.href).href) {
      video.src = activeUrl;
      video.load();
      if (activeClip) {
        video.currentTime = currentTime - activeClip.startTime + activeClip.inPoint;
      }
      if (playing) {
        video.play().catch(() => { /* user interaction required */ });
      }
    }
  }, [activeUrl]);

  // rAF playback loop
  const tick = useCallback(
    (timestamp: number) => {
      if (!playingRef.current) return;

      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = timestamp;
      }

      const delta = (timestamp - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = timestamp;

      let nextTime = currentTimeRef.current + delta;

      // Check if we've reached the end — loop back
      if (nextTime >= totalDuration) {
        nextTime = 0;
      }

      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);
      storeSeekRef.current(nextTime);

      // Check if we need to switch clips
      if (composition) {
        const clip = findClipAtTime(composition, nextTime);
        const video = videoRef.current;

        if (clip && video) {
          const url = assetResolver.resolveUrl(clip.assetId);
          const fullUrl = new URL(url, window.location.href).href;

          if (video.src !== fullUrl) {
            // Switching to a new clip
            setActiveClip(clip);
            setActiveUrl(url);
            video.src = url;
            video.currentTime = nextTime - clip.startTime + clip.inPoint;
            video.play().catch(() => {});
          }
        } else if (!clip && video) {
          video.pause();
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    },
    [composition, totalDuration],
  );

  const handlePlay = useCallback(() => {
    const video = videoRef.current;
    if (!composition) return;

    if (playing) {
      // Pause
      setPlaying(false);
      playingRef.current = false;
      cancelAnimationFrame(rafRef.current);
      if (video) video.pause();
    } else {
      // Play
      // If at end, restart from beginning
      if (currentTimeRef.current >= totalDuration - 0.1) {
        currentTimeRef.current = 0;
        setCurrentTime(0);
        storeSeek(0);
        syncClip(0);
      }

      setPlaying(true);
      playingRef.current = true;
      lastFrameTimeRef.current = 0;

      if (video && activeUrl) {
        video.play().catch(() => {});
      }

      rafRef.current = requestAnimationFrame(tick);
    }
  }, [playing, composition, totalDuration, tick, syncClip, activeUrl]);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      currentTimeRef.current = time;
      setCurrentTime(time);
      storeSeek(time);
      syncClip(time);

      const video = videoRef.current;
      if (video && composition) {
        const clip = findClipAtTime(composition, time);
        if (clip) {
          const url = assetResolver.resolveUrl(clip.assetId);
          const fullUrl = new URL(url, window.location.href).href;
          if (video.src !== fullUrl) {
            video.src = url;
            video.load();
          }
          video.currentTime = time - clip.startTime + clip.inPoint;
        }
      }
    },
    [composition, syncClip],
  );

  // Sync clip on mount and when composition changes
  useEffect(() => {
    syncClip(currentTime);
  }, [composition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

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
            {composition
              ? 'No clip at current position'
              : 'No composition loaded'}
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
