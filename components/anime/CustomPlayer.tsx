'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import bigInt from 'big-integer';
import { Api } from 'telegram/tl';
import type { TelegramClient } from 'telegram/client/TelegramClient';

const CHUNK_SIZE = 1024 * 1024;
const SPEEDS = [0.5, 1, 1.25, 1.5, 2];
const VOLUME_STORAGE_KEY = 'anime_player_volume';

type Language = 'Sub' | 'Dub';

type PendingLanguageSwitch = {
  time: number;
  wasFullScreen: boolean;
};

type CustomPlayerProps = {
  videoSeleccionado: Api.Document;
  client: TelegramClient;
  language: Language;
  availableLanguages: Language[];
  onLanguageChange: (language: Language) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onEnded?: () => void;
  startTime?: number;
  onTimeUpdate?: (time: number) => void;
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function Icon({ name }: { name: 'play' | 'pause' | 'volume' | 'mute' | 'fullscreen' | 'language' | 'previous' | 'next' }) {
  const paths = {
    play: <path d="M8 5v14l11-7z" />,
    pause: <path d="M6 5h4v14H6zm8 0h4v14h-4z" />,
    volume: <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />,
    mute: <path d="M3 9v6h4l5 5V4L7 9H3zm13.59 3 2.7 2.71-1.41 1.41-2.71-2.7-2.7 2.7-1.42-1.41 2.71-2.71-2.71-2.7 1.42-1.42 2.7 2.71 2.71-2.71 1.41 1.42L16.59 12z" />,
    fullscreen: <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />,
    language: <><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M7 11h3m4 0h3M7 15h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
    previous: <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />,
    next: <path d="m6 18 8.5-6L6 6v12zM16 6v12h2V6z" />,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      {paths[name]}
    </svg>
  );
}

export default function CustomPlayer({
  videoSeleccionado,
  client,
  language,
  availableLanguages,
  onLanguageChange,
  onPrevious,
  onNext,
  onEnded,
  startTime = 0,
  onTimeUpdate,
}: CustomPlayerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLInputElement>(null);
  const volumeRef = useRef<HTMLInputElement>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTouchRef = useRef<{ time: number; x: number } | null>(null);
  const draggingProgressRef = useRef(false);
  const pausedBeforeDragRef = useRef(true);
  const pendingLanguageSwitchRef = useRef<PendingLanguageSwitch | null>(null);
  const [streamUrl, setStreamUrl] = useState('');
  const [streamError, setStreamError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [hoveredPosition, setHoveredPosition] = useState(0);
  const [volume, setVolume] = useState(1);
  const [volumePreferenceLoaded, setVolumePreferenceLoaded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [openMenu, setOpenMenu] = useState<'speed' | 'language' | null>(null);

  useEffect(() => {
    if (!openMenu) return;

    const closeMenuOnOutsideInteraction = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest('.speed-container, .language-container')) {
        setOpenMenu(null);
      }
    };
    const closeMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };

    document.addEventListener('pointerdown', closeMenuOnOutsideInteraction);
    document.addEventListener('keydown', closeMenuOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenuOnOutsideInteraction);
      document.removeEventListener('keydown', closeMenuOnEscape);
    };
  }, [openMenu]);

  const hideControls = useCallback(() => {
    if (draggingProgressRef.current || videoRef.current?.paused) return;
    setControlsVisible(false);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (!videoRef.current?.paused) {
      hideControlsTimer.current = setTimeout(hideControls, 1500);
    }
  }, [hideControls]);

  useEffect(() => {
    let disposed = false;
    const fileId = videoSeleccionado.id.toString();
    const mimeType = videoSeleccionado.mimeType || 'video/mp4';
    const streamPath =
      `/stream/${encodeURIComponent(fileId)}` +
      `?size=${encodeURIComponent(videoSeleccionado.size.toString())}` +
      `&type=${encodeURIComponent(mimeType)}`;
    const video = videoRef.current;

    const handleWorkerMessage = (event: MessageEvent<{
      type?: string;
      fileId?: string;
      start?: string;
      end?: string;
      size?: string;
    }>) => {
      if (event.data?.type !== 'REQUEST_CHUNK' || event.data.fileId !== fileId) return;
      const port = event.ports[0];
      if (!port) return;

      void (async () => {
        try {
          await client.connect();
          const location = new Api.InputDocumentFileLocation({
            id: videoSeleccionado.id,
            accessHash: videoSeleccionado.accessHash,
            fileReference: videoSeleccionado.fileReference,
            thumbSize: '',
          });
          const start = BigInt(event.data.start ?? '0');
          const size = BigInt(event.data.size ?? videoSeleccionado.size.toString());
          const expectedLength = Number(BigInt(event.data.end ?? '0') - start + BigInt(1));
          const chunks: Uint8Array[] = [];
          let received = 0;

          for await (const chunk of client.iterDownload({
            file: location,
            offset: bigInt(start.toString()),
            requestSize: CHUNK_SIZE,
            fileSize: bigInt(size.toString()),
            dcId: videoSeleccionado.dcId,
          })) {
            const bytes = Uint8Array.from(chunk);
            chunks.push(bytes);
            received += bytes.byteLength;
            if (received >= expectedLength) break;
          }

          if (received === 0) throw new Error('Telegram no devolvió datos para este segmento.');
          const output = new Uint8Array(Math.min(received, expectedLength));
          let offset = 0;
          for (const chunk of chunks) {
            const length = Math.min(chunk.byteLength, output.byteLength - offset);
            output.set(chunk.subarray(0, length), offset);
            offset += length;
            if (offset === output.byteLength) break;
          }
          port.postMessage({ chunk: output });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          port.postMessage({ error: message });
          setStreamError(message);
        }
      })();
    };

    const setupStream = async () => {
      if (!('serviceWorker' in navigator)) {
        throw new Error('Este navegador no admite Service Workers para el streaming.');
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller && registration.active) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
            reject(new Error('El Service Worker no tomó el control de la página.'));
          }, 8000);
          const onControllerChange = () => {
            if (!navigator.serviceWorker.controller) return;
            clearTimeout(timeout);
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
            resolve();
          };
          navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
          onControllerChange();
        });
      }
      if (!navigator.serviceWorker.controller) {
        throw new Error('El Service Worker de streaming todavía no está activo.');
      }
      if (disposed) return;

      navigator.serviceWorker.addEventListener('message', handleWorkerMessage);
      setStreamError('');
      setStreamUrl(streamPath);
    };

    setStreamUrl('');
    setStreamError('');
    void setupStream().catch((error: unknown) => {
      if (!disposed) setStreamError(error instanceof Error ? error.message : String(error));
    });

    return () => {
      disposed = true;
      navigator.serviceWorker?.removeEventListener('message', handleWorkerMessage);
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, [client, videoSeleccionado]);

  useEffect(() => {
    try {
      const savedVolume = localStorage.getItem(VOLUME_STORAGE_KEY);
      if (savedVolume !== null) {
        const parsedVolume = Number(savedVolume);
        if (!Number.isFinite(parsedVolume) || parsedVolume < 0 || parsedVolume > 1) {
          console.error('El nivel de volumen guardado no es válido.');
        } else {
          setVolume(parsedVolume);
          setMuted(parsedVolume === 0);
        }
      }
    } catch (error) {
      console.error('No se pudo restaurar el volumen guardado.', error);
    } finally {
      setVolumePreferenceLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!volumePreferenceLoaded) return;
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
    } catch (error) {
      console.error('No se pudo guardar la preferencia de volumen.', error);
    }
  }, [volume, volumePreferenceLoaded]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [muted, volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))
      ) return;
      if (!wrapperRef.current || wrapperRef.current.offsetWidth === 0) return;

      const video = videoRef.current;
      if (!video) return;
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
      }
      switch (event.key) {
        case ' ':
          if (video.paused) void video.play().catch(() => setStreamError('No se pudo iniciar el video.'));
          else video.pause();
          showControls();
          break;
        case 'ArrowRight':
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
          showControls();
          break;
        case 'ArrowLeft':
          video.currentTime = Math.max(0, video.currentTime - 5);
          showControls();
          break;
        case 'ArrowUp':
          setVolume(Math.min(1, volume + 0.1));
          setMuted(false);
          showControls();
          break;
        case 'ArrowDown':
          setVolume(Math.max(0, volume - 0.1));
          setMuted(volume <= 0.1);
          showControls();
          break;
        case 'f':
        case 'F':
          if (!document.fullscreenElement) void wrapperRef.current.requestFullscreen();
          else void document.exitFullscreen();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showControls, volume]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => setStreamError('No se pudo iniciar el video.'));
    } else {
      video.pause();
    }
    showControls();
  }, [showControls]);

  const toggleFullscreen = useCallback(async () => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    try {
      if (!document.fullscreenElement) {
        await wrapper.requestFullscreen();
        const lockOrientation = Reflect.get(screen.orientation, 'lock');
        if (typeof lockOrientation === 'function') {
          await Promise.resolve(
            Reflect.apply(lockOrientation, screen.orientation, ['landscape']),
          ).catch(() => undefined);
        }
      } else {
        await document.exitFullscreen();
        const unlockOrientation = Reflect.get(screen.orientation, 'unlock');
        if (typeof unlockOrientation === 'function') Reflect.apply(unlockOrientation, screen.orientation, []);
      }
    } catch (error) {
      console.error('No se pudo cambiar el modo de pantalla completa.', error);
    }
  }, []);

  const handleLanguageChange = useCallback((nextLanguage: Language) => {
    if (nextLanguage === language) return;
    pendingLanguageSwitchRef.current = {
      time: videoRef.current?.currentTime ?? 0,
      wasFullScreen: document.fullscreenElement !== null,
    };
    onLanguageChange(nextLanguage);
  }, [language, onLanguageChange]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const rangeStyle = {
    background: `linear-gradient(to right, #a855f7 ${progress}%, rgba(255,255,255,.3) ${progress}%)`,
  };
  const volumeStyle = {
    background: `linear-gradient(to right, #a855f7 ${muted ? 0 : volume * 100}%, rgba(255,255,255,.3) ${muted ? 0 : volume * 100}%)`,
  };
  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const handleSurfaceClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('button, input, a, select, .custom-controls, .center-controls-overlay')) return;

    if (isMobile) {
      const now = Date.now();
      const previousTouch = lastTouchRef.current;
      if (previousTouch && now - previousTouch.time < 300) {
        const third = wrapperRef.current!.getBoundingClientRect().width / 3;
        if (previousTouch.x < third) {
          if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
        } else if (previousTouch.x > third * 2) {
          if (videoRef.current) videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + 10);
        } else {
          void toggleFullscreen();
        }
        lastTouchRef.current = null;
        showControls();
      } else {
        lastTouchRef.current = { time: now, x: event.clientX };
        setTimeout(() => {
          if (lastTouchRef.current?.time === now) {
            setControlsVisible((visible) => !visible);
            lastTouchRef.current = null;
          }
        }, 280);
      }
      return;
    }
    togglePlay();
  };

  return (
    <div
      ref={wrapperRef}
      className={`video-wrapper relative w-full aspect-video overflow-hidden rounded-xl bg-black shadow-2xl shadow-black/40 ${controlsVisible ? 'controls-visible' : ''}`}
      onClick={handleSurfaceClick}
      onPointerMove={showControls}
      onPointerLeave={() => {
        if (isPlaying && !draggingProgressRef.current) setControlsVisible(false);
      }}
      onDoubleClick={() => {
        if (!isMobile) void toggleFullscreen();
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <video
        ref={videoRef}
        src={streamUrl || undefined}
        preload="metadata"
        playsInline
        aria-label="Reproductor de video"
        className="video-element h-full w-full bg-black object-contain outline-none"
        onPlay={() => {
          setIsPlaying(true);
          showControls();
        }}
        onPause={() => {
          setIsPlaying(false);
          setControlsVisible(true);
          if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
        }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onCanPlay={() => setIsBuffering(false)}
        onTimeUpdate={(event) => {
          const video = event.currentTarget;
          setCurrentTime(video.currentTime);
          onTimeUpdate?.(video.currentTime);
        }}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(video.duration);
          const pendingSwitch = pendingLanguageSwitchRef.current;
          const restoreTime = pendingSwitch?.time ?? startTime;
          if (restoreTime > 0) video.currentTime = Math.min(restoreTime, video.duration || restoreTime);
        }}
        onLoadedData={(event) => {
          const pendingSwitch = pendingLanguageSwitchRef.current;
          if (!pendingSwitch) return;

          const video = event.currentTarget;
          if (pendingSwitch.time > 0) {
            video.currentTime = Math.min(pendingSwitch.time, video.duration || pendingSwitch.time);
          }

          const wrapper = wrapperRef.current;
          if (
            pendingSwitch.wasFullScreen &&
            wrapper &&
            document.fullscreenElement !== wrapper
          ) {
            void wrapper.requestFullscreen().catch((error: unknown) => {
              console.error('No se pudo restaurar la pantalla completa tras cambiar el idioma.', error);
            });
          }

          pendingLanguageSwitchRef.current = null;
          void video.play().catch((error: unknown) => {
            console.error('No se pudo reanudar el video tras cambiar el idioma.', error);
            setStreamError('No se pudo reanudar el video tras cambiar el idioma.');
          });
        }}
        onEnded={onEnded}
      />

      {isBuffering && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-white/20 border-t-purple-500 rounded-full animate-spin" />
        </div>
      )}
      {!streamUrl && !streamError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-5 text-center text-sm text-gray-300">
          Preparando streaming de Telegram…
        </div>
      )}
      {streamError && (
        <div role="alert" className="absolute inset-x-4 top-4 z-30 rounded-lg bg-red-950/90 px-4 py-3 text-sm text-red-100">
          {streamError}
        </div>
      )}

      <div className="center-controls-overlay absolute top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2">
        <button
          type="button"
          aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          onClick={togglePlay}
          className="player-center-button h-16 w-16"
        >
          <Icon name={isPlaying ? 'pause' : 'play'} />
        </button>
      </div>

      <div className={`custom-controls absolute inset-x-0 bottom-0 z-10 flex flex-col pt-10 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <div
          className="progress-wrapper relative flex h-6 items-center px-4"
          onMouseMove={(event) => {
            if (!duration || !progressRef.current) return;
            const bounds = progressRef.current.getBoundingClientRect();
            const position = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
            setHoveredPosition(position * 100);
            setHoveredTime(position * duration);
          }}
          onMouseLeave={() => setHoveredTime(null)}
        >
          {hoveredTime !== null && (
            <span
              role="tooltip"
              className="time-tooltip absolute z-20 -translate-x-1/2 rounded bg-white px-2 py-1 text-xs font-bold text-black"
              style={{ left: `${hoveredPosition}%`, bottom: '1.5rem' }}
            >
              {formatTime(hoveredTime)}
            </span>
          )}
          <input
            ref={progressRef}
            aria-label="Progreso del video"
            type="range"
            min="0"
            max="100"
            step="any"
            value={progress}
            style={rangeStyle}
            className="progress-slider w-full"
            onPointerDown={() => {
              draggingProgressRef.current = true;
              pausedBeforeDragRef.current = videoRef.current?.paused ?? true;
              videoRef.current?.pause();
              showControls();
            }}
            onPointerUp={() => {
              draggingProgressRef.current = false;
              if (!pausedBeforeDragRef.current) {
                void videoRef.current?.play().catch(() => setStreamError('No se pudo reanudar el video.'));
              }
            }}
            onChange={(event) => {
              const video = videoRef.current;
              if (!video || !duration) return;
              video.currentTime = (Number(event.target.value) / 100) * duration;
              setCurrentTime(video.currentTime);
            }}
          />
        </div>

        <div className="controls-main flex min-w-0 items-center gap-2 px-3 pb-3 pt-2 sm:gap-4 sm:px-5">
          <button type="button" aria-label={isPlaying ? 'Pausar' : 'Reproducir'} onClick={togglePlay} className="control-btn">
            <Icon name={isPlaying ? 'pause' : 'play'} />
          </button>

          <div className="volume-container flex items-center gap-1">
            <button
              type="button"
              aria-label={muted || volume === 0 ? 'Activar sonido' : 'Silenciar'}
              onClick={() => setMuted((value) => !value)}
              className="control-btn"
            >
              <Icon name={muted || volume === 0 ? 'mute' : 'volume'} />
            </button>
            <input
              ref={volumeRef}
              aria-label="Volumen"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={muted ? 0 : volume}
              style={volumeStyle}
              className="volume-slider w-0 opacity-0 transition-all duration-300"
              onChange={(event) => {
                const nextVolume = Number(event.target.value);
                setVolume(nextVolume);
                setMuted(nextVolume === 0);
              }}
            />
          </div>

          <span className="time-display whitespace-nowrap font-mono text-xs text-gray-200 sm:text-sm">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <span className="spacer flex-1" />

          <div className="speed-container relative">
            <button
              type="button"
              aria-label="Velocidad de reproducción"
              aria-expanded={openMenu === 'speed'}
              onClick={(event) => {
                event.stopPropagation();
                setOpenMenu((menu) => menu === 'speed' ? null : 'speed');
              }}
              className="control-btn text-btn text-xs font-semibold sm:text-sm"
            >
              {playbackRate}x
            </button>
            {openMenu === 'speed' && (
              <div className="player-menu absolute bottom-12 left-1/2 z-30 flex -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#1f2937] shadow-xl">
                {SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenu(null);
                      setPlaybackRate(speed);
                    }}
                    className={`px-5 py-2 text-sm text-white hover:bg-white/10 ${playbackRate === speed ? 'text-primary-light' : ''}`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="language-container relative">
            <button
              type="button"
              aria-label="Cambiar idioma"
              aria-expanded={openMenu === 'language'}
              onClick={(event) => {
                event.stopPropagation();
                setOpenMenu((menu) => menu === 'language' ? null : 'language');
              }}
              className="control-btn"
            >
              <Icon name="language" />
            </button>
            {openMenu === 'language' && (
              <div className="player-menu absolute bottom-12 left-1/2 z-30 flex -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#1f2937] shadow-xl">
                {(['Sub', 'Dub'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={!availableLanguages.includes(option)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenu(null);
                      handleLanguageChange(option);
                    }}
                    className={`px-6 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 ${language === option ? 'font-bold text-primary-light' : ''}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" aria-label="Pantalla completa" onClick={() => void toggleFullscreen()} className="control-btn">
            <Icon name="fullscreen" />
          </button>
        </div>
      </div>
    </div>
  );
}
