'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Api } from 'telegram/tl';
import CustomPlayer from '@/components/anime/CustomPlayer';
import CommentSection from '@/components/anime/CommentSection';
import { useTelegram } from '@/context/TelegramContext';
import { extractAnimeData, parseAnimeMessages } from '@/hooks/useAnimeData';
import type { TelegramAnimeMessage } from '@/hooks/anime';
import { useTelegramImage } from '@/hooks/useTelegramImage';
import { getTelegramMessageText } from '@/hooks/telegramMessageText';

const ANIME_GROUP = 'AnimeKT1';
const EPISODE_GROUP = 'AnimeKTe';
const CATALOG_TOPIC = 16;
const ITEMS_PER_PAGE = 100;

type Language = 'Sub' | 'Dub';

type Episode = {
  message: TelegramAnimeMessage;
  document: Api.Document;
  label: string;
};

function readDocument(message: TelegramAnimeMessage) {
  const media = message.media;
  if (!(media instanceof Api.MessageMediaDocument) || !(media.document instanceof Api.Document)) {
    return null;
  }
  return media.document;
}

function isVideoMessage(message: TelegramAnimeMessage) {
  const file = readDocument(message);
  return Boolean(
    file &&
      (file.mimeType.startsWith('video/') ||
        file.attributes.some((attribute) => attribute instanceof Api.DocumentAttributeVideo)),
  );
}

function createEpisodeLabel(message: TelegramAnimeMessage, episodeNumber: number) {
  const text = getTelegramMessageText(message).trim();
  const capMatch = text.match(/C\s*A\s*P\s*-\s*([0-9\.]+)/i) ||
    text.match(/EPISODIO N[°o]\s*([0-9\.]+)/i);
  const forcedNumber = text.match(/\[([0-9\.]+)\]/);
  if (forcedNumber) {
    const number = Number.parseFloat(forcedNumber[1]);
    return { label: `Episodio ${forcedNumber[1]}`, nextNumber: Math.floor(number) + 1 };
  }
  if (capMatch) {
    const number = Number.parseFloat(capMatch[1]);
    return { label: `Episodio ${capMatch[1]}`, nextNumber: Math.floor(number) + 1 };
  }

  const special = text.match(/(ova|pel[íi]cula|especial|\b\d+\.\d+\b)/i);
  if (!special) return { label: `Episodio ${episodeNumber}`, nextNumber: episodeNumber + 1 };

  const decimal = text.match(/\b\d+\.\d+\b/);
  if (decimal) {
    return {
      label: `Episodio ${decimal[0]}`,
      nextNumber: Math.floor(Number.parseFloat(decimal[0])) + 1,
    };
  }
  return { label: special[0].toUpperCase(), nextNumber: episodeNumber };
}

function seasonsFor(
  anime: Pick<ReturnType<typeof extractAnimeData>, 'topicsSub' | 'topicsDub'>,
  language: Language,
) {
  return language === 'Dub' ? anime.topicsDub : anime.topicsSub;
}

export default function AnimePlayerPage() {
  const params = useParams<{ id: string; episode_id?: string }>();
  const animeId = params.id;
  const requestedEpisodeId = params.episode_id ? Number(params.episode_id) : null;
  const { client, isLoading: isTelegramLoading } = useTelegram();
  const [anime, setAnime] = useState<ReturnType<typeof extractAnimeData> | null>(null);
  const [bannerMessage, setBannerMessage] = useState<TelegramAnimeMessage | null>(null);
  const { imageUrl: bannerImageUrl } = useTelegramImage(bannerMessage ?? undefined);
  const [language, setLanguage] = useState<Language>('Sub');
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [currentRange, setCurrentRange] = useState(0);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [isLoadingAnime, setIsLoadingAnime] = useState(true);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [episodeError, setEpisodeError] = useState<string | null>(null);
  const pendingLanguageEpisodeRef = useRef<number | null>(null);
  const [requestedTopicId, setRequestedTopicId] = useState<number | null>(null);
  const [requestedLanguage, setRequestedLanguage] = useState<Language | null>(null);
  const [requestedFileId, setRequestedFileId] = useState<number | null>(null);
  const [hasReadRouteSelection, setHasReadRouteSelection] = useState(false);

  const availableLanguages = useMemo<Language[]>(() => {
    if (!anime) return [];
    return [
      ...(anime.topicsSub.length ? ['Sub' as const] : []),
      ...(anime.topicsDub.length ? ['Dub' as const] : []),
    ];
  }, [anime]);
  const seasonTopics = useMemo(
    () => anime ? seasonsFor(anime, language) : [],
    [anime, language],
  );
  const activeSeasonIndex = selectedTopicId === null ? 0 : seasonTopics.indexOf(selectedTopicId);

  useEffect(() => {
    const routeQuery = new URLSearchParams(window.location.search);
    const topicId = Number(routeQuery.get('topic'));
    const fileId = Number(routeQuery.get('fileId'));
    const routeLanguage = routeQuery.get('language');
    setRequestedTopicId(Number.isSafeInteger(topicId) && topicId > 0 ? topicId : null);
    setRequestedLanguage(routeLanguage === 'Sub' || routeLanguage === 'Dub' ? routeLanguage : null);
    setRequestedFileId(Number.isSafeInteger(fileId) && fileId > 0 ? fileId : null);
    setHasReadRouteSelection(true);
  }, [animeId, requestedEpisodeId]);

  useEffect(() => {
    let cancelled = false;

    const loadAnime = async () => {
      if (isTelegramLoading || !hasReadRouteSelection) return;
      if (!client) {
        setError('No hay una sesión de Telegram activa. Inicia sesión para continuar.');
        setIsLoadingAnime(false);
        return;
      }

      if (animeId === 'notification') {
        const routeQuery = new URLSearchParams(window.location.search);
        const notificationTitle = routeQuery.get('title')?.trim();
        if (!requestedFileId || !notificationTitle) {
          setError('El enlace del episodio no contiene un título o video válido.');
          setIsLoadingAnime(false);
          return;
        }

        setAnime(extractAnimeData(`Título: ${notificationTitle}`));
        setBannerMessage(null);
        setLanguage('Sub');
        setSelectedTopicId(null);
        setStartTime(0);
        setIsLoadingAnime(false);
        return;
      }

      const messageId = Number(animeId);
      if (!Number.isSafeInteger(messageId) || messageId <= 0) {
        setError('El identificador del anime no es válido.');
        setIsLoadingAnime(false);
        return;
      }

      setIsLoadingAnime(true);
      setError(null);
      try {
        await client.connect();
        const selectedMessages = await client.getMessages(ANIME_GROUP, { ids: [messageId] });
        const selectedMessage = selectedMessages[0];
        if (!selectedMessage) throw new Error('No se encontró el anime solicitado en Telegram.');

        const catalogMessages = await client.getMessages(ANIME_GROUP, {
          replyTo: CATALOG_TOPIC,
          limit: 500,
        });
        const catalogAnime = parseAnimeMessages(catalogMessages).find(
          (item) => item.message.id === messageId || item.heroMessage.id === messageId,
        );
        const parsedAnime = catalogAnime ?? {
          ...extractAnimeData(getTelegramMessageText(selectedMessage)),
          id: String(messageId),
          message: selectedMessage,
          heroMessage: selectedMessage,
        };
        const savedProgress = localStorage.getItem(`progreso_anime_${animeId}`);
        const progress = savedProgress
          ? JSON.parse(savedProgress) as { topicId?: number; videoId?: number; tiempo?: number }
          : null;
        const initialLanguage: Language =
          requestedLanguage && seasonsFor(parsedAnime, requestedLanguage).length > 0
            ? requestedLanguage
            : progress?.topicId && parsedAnime.topicsDub.includes(progress.topicId)
            ? 'Dub'
            : parsedAnime.topicsSub.length > 0
              ? 'Sub'
              : 'Dub';
        const initialTopics = seasonsFor(parsedAnime, initialLanguage);
        const initialTopic = requestedTopicId && initialTopics.includes(requestedTopicId)
          ? requestedTopicId
          : progress?.topicId && initialTopics.includes(progress.topicId)
          ? progress.topicId
          : initialTopics[0] ?? null;

        if (cancelled) return;
        setAnime(parsedAnime);
        setBannerMessage(parsedAnime.heroMessage);
        setLanguage(initialLanguage);
        setSelectedTopicId(initialTopic);
        setStartTime(progress?.tiempo ?? 0);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (!cancelled) setIsLoadingAnime(false);
      }
    };

    void loadAnime();
    return () => {
      cancelled = true;
    };
  }, [animeId, client, hasReadRouteSelection, isTelegramLoading, requestedFileId, requestedLanguage, requestedTopicId]);

  useEffect(() => {
    let cancelled = false;
    if (!client || (selectedTopicId === null && requestedFileId === null)) {
      setEpisodes([]);
      setSelectedEpisode(null);
      setEpisodeError(null);
      return;
    }

    const loadEpisodes = async () => {
      setIsLoadingEpisodes(true);
      setEpisodeError(null);
      try {
        await client.connect();
        const linkedMessages = requestedFileId
          ? await client.getMessages(EPISODE_GROUP, { ids: [requestedFileId] })
          : [];
        const linkedMessage = linkedMessages.find(isVideoMessage);
        if (requestedFileId && !linkedMessage) {
          throw new Error('No se encontró el video asociado a esta notificación.');
        }

        if (animeId === 'notification' && selectedTopicId === null && linkedMessage) {
          const topicId = linkedMessage.replyTo?.replyToTopId ?? linkedMessage.replyTo?.replyToMsgId;
          if (!topicId) {
            throw new Error('No se pudo identificar el topic de Telegram al que pertenece este video.');
          }
          setSelectedTopicId(topicId);
          return;
        }

        const topicId = selectedTopicId ?? linkedMessage?.replyTo?.replyToTopId ??
          linkedMessage?.replyTo?.replyToMsgId ?? null;
        const messages = topicId === null
          ? []
          : await client.getMessages(EPISODE_GROUP, {
              replyTo: topicId,
              limit: 1000,
            });

        let episodeNumber = 1;
        const foundEpisodes = messages.filter(isVideoMessage).reverse().flatMap((message) => {
          const document = readDocument(message);
          if (!document) return [];
          const episode = animeId === 'notification'
            ? { label: `Episodio ${episodeNumber}`, nextNumber: episodeNumber + 1 }
            : createEpisodeLabel(message, episodeNumber);
          episodeNumber = episode.nextNumber;
          return [{ message, document, label: episode.label }];
        });
        const linkedDocument = linkedMessage ? readDocument(linkedMessage) : null;
        const linkedEpisode = linkedMessage && linkedDocument
          ? {
              message: linkedMessage,
              document: linkedDocument,
              label: foundEpisodes.find((episode) => episode.message.id === linkedMessage.id)?.label ??
                `Episodio ${episodeNumber}`,
            }
          : null;
        const episodesWithLinkedVideo = linkedEpisode &&
          !foundEpisodes.some((episode) => episode.message.id === linkedEpisode.message.id)
          ? [linkedEpisode, ...foundEpisodes]
          : foundEpisodes;

        const savedProgress = localStorage.getItem(`progreso_anime_${animeId}`);
        const progress = savedProgress
          ? JSON.parse(savedProgress) as { topicId?: number; videoId?: number; tiempo?: number }
          : null;
        const requestedRouteEpisode = requestedEpisodeId
          ? episodesWithLinkedVideo.find((episode) => episode.message.id === requestedEpisodeId)
          : undefined;
        const fileRouteEpisode = requestedFileId
          ? episodesWithLinkedVideo.find((episode) => episode.message.id === requestedFileId)
          : undefined;
        const restoredEpisode = fileRouteEpisode ?? requestedRouteEpisode ?? (progress?.topicId === selectedTopicId
          ? episodesWithLinkedVideo.find((episode) => episode.message.id === progress.videoId)
          : undefined);
        const pendingEpisodeNumber = pendingLanguageEpisodeRef.current;
        const languageEpisode = pendingEpisodeNumber === null
          ? undefined
          : episodesWithLinkedVideo.find((episode) =>
              Number(episode.label.match(/\d+(?:\.\d+)?/)?.[0]) === pendingEpisodeNumber,
            ) ?? episodesWithLinkedVideo[Math.min(pendingEpisodeNumber - 1, episodesWithLinkedVideo.length - 1)];
        const activeEpisode = languageEpisode ?? restoredEpisode ?? episodesWithLinkedVideo[0] ?? null;

        if (cancelled) return;
        setEpisodes(episodesWithLinkedVideo);
        setSelectedEpisode(activeEpisode);
        const activeEpisodeIndex = activeEpisode
          ? episodesWithLinkedVideo.findIndex((episode) => episode.message.id === activeEpisode.message.id)
          : -1;
        setCurrentRange(activeEpisodeIndex >= 0 ? Math.floor(activeEpisodeIndex / ITEMS_PER_PAGE) : 0);
        if (pendingEpisodeNumber !== null) {
          pendingLanguageEpisodeRef.current = null;
        } else if (restoredEpisode) {
          setStartTime(progress?.videoId === restoredEpisode.message.id ? progress.tiempo ?? 0 : 0);
        }
      } catch (loadError) {
        if (!cancelled) {
          setEpisodeError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) setIsLoadingEpisodes(false);
      }
    };

    void loadEpisodes();
    return () => {
      cancelled = true;
    };
  }, [animeId, client, requestedEpisodeId, requestedFileId, selectedTopicId]);

  const changeLanguage = useCallback((nextLanguage: Language) => {
    if (!anime || nextLanguage === language) return;
    const nextTopics = seasonsFor(anime, nextLanguage);
    if (nextTopics.length === 0) return;

    const currentTime = document.querySelector('video')?.currentTime ?? 0;
    const currentEpisodeNumber = Number(selectedEpisode?.label.match(/\d+(?:\.\d+)?/)?.[0]);
    const currentEpisodeIndex = episodes.findIndex(
      (episode) => episode.message.id === selectedEpisode?.message.id,
    );
    pendingLanguageEpisodeRef.current = Number.isFinite(currentEpisodeNumber) && currentEpisodeNumber > 0
      ? currentEpisodeNumber
      : Math.max(1, currentEpisodeIndex + 1);
    const nextIndex = Math.min(Math.max(activeSeasonIndex, 0), nextTopics.length - 1);
    setLanguage(nextLanguage);
    setSelectedTopicId(nextTopics[nextIndex]);
    setStartTime(currentTime);
  }, [activeSeasonIndex, anime, episodes, language, selectedEpisode]);

  const chooseEpisode = useCallback((episode: Episode) => {
    setSelectedEpisode(episode);
    const episodeIndex = episodes.findIndex((item) => item.message.id === episode.message.id);
    setCurrentRange(episodeIndex >= 0 ? Math.floor(episodeIndex / ITEMS_PER_PAGE) : 0);
    setStartTime(0);
  }, [episodes]);

  const selectRelativeEpisode = useCallback((offset: number) => {
    if (!selectedEpisode) return;
    const nextIndex = episodes.findIndex((episode) => episode.message.id === selectedEpisode.message.id) + offset;
    if (nextIndex >= 0 && nextIndex < episodes.length) chooseEpisode(episodes[nextIndex]);
  }, [chooseEpisode, episodes, selectedEpisode]);

  const saveProgress = useCallback((time: number) => {
    if (!selectedEpisode || selectedTopicId === null) return;
    const video = document.querySelector('video');
    if (!video || !Number.isFinite(video.duration) || time >= video.duration - 10) return;
    const previous = Number(video.dataset.lastProgressSaved ?? 0);
    if (time < previous + 5) return;
    video.dataset.lastProgressSaved = String(Math.floor(time));
    localStorage.setItem(`progreso_anime_${animeId}`, JSON.stringify({
      topicId: selectedTopicId,
      videoId: selectedEpisode.message.id,
      tiempo: time,
    }));
  }, [animeId, selectedEpisode, selectedTopicId]);

  const handleSeasonChange = (topicId: number) => {
    setCurrentRange(0);
    setSelectedTopicId(topicId);
    setStartTime(0);
  };

  const title = anime?.title ?? 'Anime';
  const totalRanges = Math.ceil(episodes.length / ITEMS_PER_PAGE);
  const displayedEpisodes = episodes.slice(
    currentRange * ITEMS_PER_PAGE,
    (currentRange + 1) * ITEMS_PER_PAGE,
  );
  const currentEpisodeIndex = episodes.findIndex(
    (episode) => episode.message.id === selectedEpisode?.message.id,
  );

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-8">
      {error ? (
        <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-5 py-4 text-sm text-red-200">
          {error}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
            <section aria-label="Reproductor e información" className="min-w-0 lg:col-span-3">
              {client && selectedEpisode ? (
                        <CustomPlayer
                  videoSeleccionado={selectedEpisode.document}
                  client={client}
                  language={language}
                  availableLanguages={availableLanguages}
                  onLanguageChange={changeLanguage}
                  onPrevious={currentEpisodeIndex > 0 ? () => selectRelativeEpisode(-1) : undefined}
                  onNext={currentEpisodeIndex >= 0 && currentEpisodeIndex < episodes.length - 1
                    ? () => selectRelativeEpisode(1)
                    : undefined}
                  onEnded={() => selectRelativeEpisode(1)}
                  startTime={startTime}
                  onTimeUpdate={saveProgress}
                />
              ) : (
                <div className="video-wrapper relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-black px-5 text-center shadow-2xl">
                  <p className="text-sm text-gray-400">
                    {isLoadingAnime || isLoadingEpisodes
                      ? 'Cargando reproductor...'
                      : 'Selecciona un episodio para reproducirlo.'}
                  </p>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={currentEpisodeIndex <= 0}
                  onClick={() => selectRelativeEpisode(-1)}
                  className="min-h-10 rounded-lg border border-white/10 px-4 text-sm font-semibold text-gray-200 transition hover:border-primary/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ‹ Anterior
                </button>
                <button
                  type="button"
                  disabled={currentEpisodeIndex < 0 || currentEpisodeIndex >= episodes.length - 1}
                  onClick={() => selectRelativeEpisode(1)}
                  className="min-h-10 rounded-lg border border-white/10 px-4 text-sm font-semibold text-gray-200 transition hover:border-primary/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Siguiente ›
                </button>
              </div>

              <section className="relative mt-6 overflow-hidden rounded-xl border border-white/10 bg-[#1a1c23]">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-0 scale-110 bg-cover bg-center opacity-40 blur-sm"
                  style={{
                    backgroundImage: `url(${JSON.stringify(bannerImageUrl ?? '/anime-placeholder.svg')})`,
                  }}
                />
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 bg-black/50" />
                <div className="relative z-10 p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-light">
                  {selectedEpisode?.label ?? 'Reproductor'}
                </p>
                <Link
                  href={`/anime/${encodeURIComponent(animeId)}`}
                  className="mt-2 inline-block text-2xl font-black tracking-tight text-white transition-colors hover:text-purple-400 hover:underline cursor-pointer sm:text-3xl"
                >
                  {isLoadingAnime ? 'Cargando anime...' : title}
                </Link>
                {anime && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-300">
                    {anime.year && <span>{anime.year}</span>}
                    {anime.genres.map((genre) => (
                      <span key={genre} className="rounded-full bg-white/10 px-3 py-1 text-xs">{genre}</span>
                    ))}
                    {anime.audio && <span>{anime.audio}</span>}
                  </div>
                )}
                {anime?.synopsis && (
                  <p className="mt-4 max-w-4xl text-sm leading-7 text-gray-400">{anime.synopsis}</p>
                )}
                </div>
              </section>
            </section>

            <aside aria-labelledby="episode-list-title" className="h-fit rounded-xl bg-[#151720] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-light">Reproducción</p>
              <h2 id="episode-list-title" className="mt-1 text-lg font-bold text-white">
                Estás viendo {selectedEpisode?.label ?? 'un episodio'}
              </h2>
              {seasonTopics.length > 0 && (
                <label className="mt-4 block text-xs text-gray-400">
                  <span className="mb-2 block">Temporada</span>
                  <select
                    aria-label="Seleccionar temporada"
                    value={selectedTopicId ?? ''}
                    onChange={(event) => handleSeasonChange(Number(event.target.value))}
                    className="min-h-10 w-full rounded-lg border border-white/10 bg-[#0d0e14] px-3 text-sm text-white outline-none focus:border-primary"
                  >
                    {seasonTopics.map((topicId, index) => (
                      <option key={`season-${topicId || 'default'}-${index}`} value={topicId}>
                        {language} · {seasonTopics.length === 1 ? 'Temporada Única' : `Temporada ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {episodeError && (
                <p role="alert" className="mt-4 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">
                  No se pudieron cargar episodios: {episodeError}
                </p>
              )}
              {isLoadingEpisodes ? (
                <p role="status" className="py-6 text-sm text-gray-400">Cargando episodios...</p>
              ) : episodes.length > 0 ? (
                <>
                  {totalRanges > 1 && (
                    <div className="mb-4 mt-4 flex items-center justify-between rounded-lg border border-white/5 bg-[#1a1c24] p-2">
                      <select
                        aria-label="Seleccionar rango de episodios"
                        value={currentRange}
                        onChange={(event) => setCurrentRange(Number(event.target.value))}
                        className="w-full cursor-pointer bg-transparent text-sm text-white outline-none"
                      >
                        {Array.from({ length: totalRanges }, (_, index) => (
                          <option key={index} value={index} className="bg-[#1a1c24] text-white">
                            {index * ITEMS_PER_PAGE + 1} - {Math.min((index + 1) * ITEMS_PER_PAGE, episodes.length)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="mt-4 grid max-h-[60vh] grid-cols-5 gap-2 overflow-y-auto pr-2 custom-scrollbar">
                  {displayedEpisodes.map((episode, index) => {
                    const active = selectedEpisode?.message.id === episode.message.id;
                    return (
                      <button
                        key={`episode-${selectedTopicId ?? 'default'}-${episode.message.id}-${index}`}
                        type="button"
                        aria-label={`${episode.label}, ${language}`}
                        aria-pressed={active}
                        onClick={() => chooseEpisode(episode)}
                        className={`grid min-h-10 place-items-center rounded-lg text-xs transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light ${
                          active
                            ? 'border-2 border-purple-500 bg-[#2a2d3e] text-purple-400 font-bold shadow-[0_0_10px_rgba(168,85,247,0.25)]'
                            : 'border border-white/10 bg-[#2a2d3e] font-semibold text-gray-300 hover:bg-[#3b3e54] hover:text-white'
                        }`}
                      >
                        {episode.label.match(/\d+(?:\.\d+)?/)?.[0] ?? episode.label}
                      </button>
                    );
                  })}
                  </div>
                </>
              ) : (
                <p className="mt-4 rounded-lg border border-white/10 bg-[#0d0e14] p-4 text-center text-xs text-gray-400">
                  {seasonTopics.length
                    ? 'No se encontraron videos en esta temporada.'
                    : 'Este anime no tiene temporadas Sub o Dub asignadas.'}
                </p>
              )}
            </aside>
          </div>
        </>
      )}
      <CommentSection />
    </main>
  );
}
