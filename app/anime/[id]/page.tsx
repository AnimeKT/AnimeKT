'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Api } from 'telegram/tl';
import type { TelegramAnimeMessage } from '@/hooks/anime';
import { useTelegram } from '@/context/TelegramContext';
import { useSharedAnimeData } from '@/context/AnimeDataContext';
import { useTelegramImage } from '@/hooks/useTelegramImage';
import { getTelegramMessageText } from '@/hooks/telegramMessageText';
import CommentSection from '@/components/anime/CommentSection';
import EpisodeThumbnail from '@/components/anime/EpisodeThumbnail';
import ThreeDCoverImage from '@/components/anime/3DCoverImage';

const EPISODE_GROUP = 'AnimeKTe';
const EMPTY_SEASON_ERROR = 'Esta temporada aún no ha sido subida o no tiene episodios disponibles.';

type EpisodeLink = {
  id: number;
  topicId: number;
  language: 'Sub' | 'Dub';
  label: string;
  message: TelegramAnimeMessage;
};

function videoDocument(message: TelegramAnimeMessage) {
  const media = message.media;
  if (!(media instanceof Api.MessageMediaDocument) || !(media.document instanceof Api.Document)) {
    return false;
  }
  return media.document.mimeType.startsWith('video/') ||
    media.document.attributes.some((attribute) => attribute instanceof Api.DocumentAttributeVideo);
}

function episodeLabel(message: TelegramAnimeMessage, fallback: number) {
  const text = getTelegramMessageText(message).trim();
  const explicitNumber = text.match(/\[(\d+(?:\.\d+)?)\]/)?.[1] ?? text.match(/\b(?:ep(?:isode|isodio)?\.?\s*)?(\d+\.\d+|\d+)\b/i)?.[1];
  if (explicitNumber) return `Episodio ${explicitNumber}`;
  const special = text.match(/ova|pel[íi]cula|especial/i)?.[0];
  return special ? special.toUpperCase() : `Episodio ${fallback}`;
}

function getEpisodeListSignature(episodes: EpisodeLink[]) {
  return JSON.stringify(episodes.map((episode) => {
    const media = episode.message.media;
    const documentId = media instanceof Api.MessageMediaDocument &&
      media.document instanceof Api.Document
      ? media.document.id.toString()
      : null;

    return {
      id: episode.id,
      topicId: episode.topicId,
      language: episode.language,
      label: episode.label,
      text: getTelegramMessageText(episode.message),
      documentId,
    };
  }));
}

export default function AnimeCoverPage() {
  const { id } = useParams<{ id: string }>();
  const { animes, isLoading: isLoadingAnime } = useSharedAnimeData();
  const { client, isLoading: isTelegramLoading } = useTelegram();
  const anime = useMemo(
    () => animes.find((item) =>
      item.id === id || item.messageId === Number(id) || item.heroMessageId === Number(id),
    ),
    [animes, id],
  );
  const { imageUrl } = useTelegramImage(anime?.message, anime?.messageId);
  const { imageUrl: bannerImageUrl } = useTelegramImage(anime?.heroMessage, anime?.heroMessageId);
  const [episodes, setEpisodes] = useState<EpisodeLink[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<'Sub' | 'Dub'>('Sub');
  const [selectedSeasonKey, setSelectedSeasonKey] = useState('');
  const [isLoadingInitialEpisodes, setIsLoadingInitialEpisodes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const episodesRef = useRef(episodes);
  const errorRef = useRef(error);
  episodesRef.current = episodes;
  errorRef.current = error;

  const episodeTopics = useMemo(() => {
    if (!anime) return [];
    return [
      ...new Set(anime.topicsSub.map((topicId) => `Sub:${topicId}`)),
      ...new Set(anime.topicsDub.map((topicId) => `Dub:${topicId}`)),
    ].map((topic) => {
      const [language, topicId] = topic.split(':') as ['Sub' | 'Dub', string];
      return { language, topicId: Number(topicId) };
    });
  }, [anime]);

  useEffect(() => {
    const firstTopic = episodeTopics[0];
    if (!firstTopic) {
      setSelectedSeasonKey('');
      return;
    }
    setSelectedLanguage(firstTopic.language);
    setSelectedSeasonKey(`${firstTopic.language}:${firstTopic.topicId}`);
  }, [episodeTopics]);

  const languageTopics = episodeTopics.filter(({ language }) => language === selectedLanguage);
  const selectedSeason = languageTopics.find(
    ({ language, topicId }) => `${language}:${topicId}` === selectedSeasonKey,
  );

  const handleLanguageChange = (language: 'Sub' | 'Dub') => {
    setError(null);
    setEpisodes([]);
    setSelectedLanguage(language);
    const firstTopic = episodeTopics.find((topic) => topic.language === language);
    setSelectedSeasonKey(firstTopic ? `${firstTopic.language}:${firstTopic.topicId}` : '');
  };

  const handleSeasonChange = (topicId: number) => {
    setError(null);
    setEpisodes([]);
    setSelectedSeasonKey(`${selectedLanguage}:${topicId}`);
  };

  useEffect(() => {
    if (!anime) return;
    const favorites = JSON.parse(localStorage.getItem('mis_favoritos') || '[]') as string[];
    setIsFavorite(favorites.includes(anime.id));
  }, [anime]);

  useEffect(() => {
    if (!anime) return;
    const watchedAnime: unknown = JSON.parse(localStorage.getItem('animes_vistos') || '[]');
    setIsWatched(Array.isArray(watchedAnime) && watchedAnime.includes(anime.id));
  }, [anime]);

  useEffect(() => {
    let cancelled = false;
    let isRefreshing = false;
    let refreshTimer: number | undefined;
    if (!client || !anime || !selectedSeason) {
      setEpisodes([]);
      setError(null);
      return;
    }

    const loadEpisodes = async (initial = false) => {
      if (isRefreshing) return;
      isRefreshing = true;
      const hasVisibleResult = episodesRef.current.length > 0 || errorRef.current !== null;
      const showInitialLoading = initial && !hasVisibleResult;
      if (showInitialLoading) setIsLoadingInitialEpisodes(true);
      try {
        await client.connect();
        const messages = await client.getMessages(EPISODE_GROUP, {
          replyTo: selectedSeason.topicId,
          limit: 100,
        });
        const selectedEpisodes = messages.filter(videoDocument).reverse().map((message, index) => ({
          id: message.id,
          topicId: selectedSeason.topicId,
          language: selectedSeason.language,
          label: episodeLabel(message, index + 1),
          message,
        }));
        if (!cancelled) {
          if (getEpisodeListSignature(episodesRef.current) !== getEpisodeListSignature(selectedEpisodes)) {
            setEpisodes(selectedEpisodes);
          }
          if (errorRef.current !== null) setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : String(loadError);
          const nextError = /MSG_ID_INVALID|MESSAGE_ID_INVALID/i.test(message)
            ? EMPTY_SEASON_ERROR
            : message;
          if (episodesRef.current.length > 0) setEpisodes([]);
          if (errorRef.current !== nextError) setError(nextError);
        }
      } finally {
        if (!cancelled && showInitialLoading) setIsLoadingInitialEpisodes(false);
        isRefreshing = false;
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadEpisodes();
    };

    void loadEpisodes(true);
    refreshTimer = window.setInterval(() => void loadEpisodes(), 60_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [anime, client, selectedSeason]);

  const toggleFavorite = () => {
    if (!anime) return;
    const favorites = JSON.parse(localStorage.getItem('mis_favoritos') || '[]') as string[];
    const nextFavorites = favorites.includes(anime.id)
      ? favorites.filter((favorite) => favorite !== anime.id)
      : [...favorites, anime.id];
    localStorage.setItem('mis_favoritos', JSON.stringify(nextFavorites));
    setIsFavorite(!favorites.includes(anime.id));
  };

  const handleToggleWatched = async () => {
    if (!anime) return;
    const previousState = isWatched;
    const nextState = !previousState;
    setIsWatched(nextState);

    try {
      const storedWatched: unknown = JSON.parse(localStorage.getItem('animes_vistos') || '[]');
      const watchedAnime = Array.isArray(storedWatched)
        ? storedWatched.filter((animeId): animeId is string => typeof animeId === 'string')
        : [];
      const nextWatched = nextState
        ? [...new Set([...watchedAnime, anime.id])]
        : watchedAnime.filter((animeId) => animeId !== anime.id);
      localStorage.setItem('animes_vistos', JSON.stringify(nextWatched));
    } catch (error) {
      console.error('Error al actualizar el estado de visto:', error);
      setIsWatched(previousState);
    }
  };

  if (isLoadingAnime || isTelegramLoading) {
    return <main className="mx-auto min-h-screen max-w-7xl px-5 py-12 text-gray-400">Cargando anime...</main>;
  }

  if (!anime) {
    return (
      <main className="mx-auto min-h-screen max-w-7xl px-5 py-12">
        <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-5 py-4 text-sm text-red-200">
          No se encontró este anime en el catálogo.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-10 sm:px-8">
      <div className="relative flex flex-col gap-8 overflow-hidden rounded-xl border border-white/5 p-6 shadow-lg md:flex-row md:p-8">
        <div
          aria-hidden="true"
          className="absolute inset-0 z-0 scale-110 bg-cover bg-center opacity-40 blur-sm"
          style={{ backgroundImage: `url(${JSON.stringify(bannerImageUrl ?? imageUrl ?? '/anime-placeholder.svg')})` }}
        />
        <div aria-hidden="true" className="absolute inset-0 z-0 bg-black/40" />
        <section className="relative z-10 flex min-w-0 flex-1 flex-col gap-8 md:flex-row md:items-start">
          <div className="relative z-10 mx-auto aspect-[2/3] w-64 shrink-0 md:mx-0 lg:w-80">
            <ThreeDCoverImage
              src={imageUrl ?? '/anime-placeholder.svg'}
              alt={`${anime.title} portada`}
            />
          </div>

          <div className="relative z-10 min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-light">
            {anime.status}
          </p>
          <h1 className="mt-2 break-words text-2xl font-bold leading-normal tracking-tight text-white md:text-3xl lg:text-4xl">
            {anime.title}
          </h1>
          {anime.alternativeTitles && (
            <p className="mt-2 text-sm text-gray-400">{anime.alternativeTitles}</p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {anime.genres.map((genre) => (
              <Link
                key={genre}
                href={`/catalogo?genero=${encodeURIComponent(genre)}`}
                className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-[#8b5cf6] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
              >
                {genre}
              </Link>
            ))}
          </div>
          <div className="mt-6 mb-6 flex flex-wrap items-center gap-4">
            <button
              type="button"
              aria-pressed={isFavorite}
              onClick={toggleFavorite}
              className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
            >
              {isFavorite ? '✓ En mi lista' : '＋ Agregar a Lista'}
            </button>
            <button
              type="button"
              aria-pressed={isWatched}
              onClick={() => void handleToggleWatched()}
              className={`flex min-h-11 items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light ${
                isWatched
                  ? 'border-green-600/50 bg-green-600/20 text-green-400 hover:bg-green-600/30'
                  : 'border-transparent bg-[#2a2a3e] text-gray-300 hover:bg-[#3a3a4e]'
              }`}
            >
              {isWatched ? (
                <>
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Visto
                </>
              ) : (
                <>
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Marcar como visto
                </>
              )}
            </button>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {[anime.year, anime.type, anime.audio]
              .filter(Boolean)
              .map((value, index) => (
                <span key={`${value}-${index}`} className="rounded-full border border-gray-600 px-3 py-1 text-xs text-gray-300 md:text-sm">
                  {value}
                </span>
              ))}
            {anime.studio !== 'Desconocido' && (
              <span className="rounded-full border border-gray-600 px-3 py-1 text-xs text-gray-300 md:text-sm">
                {anime.studio}
              </span>
            )}
            {anime.author !== 'Desconocido' && (
              <span className="rounded-full border border-gray-600 px-3 py-1 text-xs text-gray-300 md:text-sm">
                {anime.author}
              </span>
            )}
          </div>
          <h2 className="mt-7 text-lg font-bold text-white">Sinopsis</h2>
          <p className="mt-2 max-w-4xl whitespace-pre-line text-sm leading-snug text-gray-300 md:text-base">
            {anime.synopsis}
          </p>
          </div>
        </section>
      </div>

      <section aria-labelledby="episodes-title" className="mt-12">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-light">Elige tu episodio</p>
            <h2 id="episodes-title" className="mt-1 text-2xl font-bold text-white">Episodios</h2>
          </div>
          <span className="text-sm text-gray-400">{episodes.length} episodios</span>
        </div>
        {episodeTopics.length > 0 && (
          <div className="mb-5 flex flex-col gap-3 sm:ml-auto sm:w-fit sm:flex-row">
            {new Set(episodeTopics.map(({ language }) => language)).size > 1 && (
              <label className="flex items-center justify-between gap-3 text-sm text-gray-300">
                <span>Idioma</span>
                <select
                  aria-label="Seleccionar idioma"
                  value={selectedLanguage}
                  onChange={(event) => handleLanguageChange(event.target.value as 'Sub' | 'Dub')}
                  className="min-h-11 min-w-40 rounded-lg border border-white/10 bg-[#1f2937] px-4 text-white outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
                >
                  {[...new Set(episodeTopics.map(({ language }) => language))].map((language) => (
                    <option key={language} value={language}>
                      {language === 'Sub' ? 'Japonés (Sub)' : 'Latino (Dub)'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {languageTopics.length > 0 && (
              <label className="flex items-center justify-between gap-3 text-sm text-gray-300">
                <span>Temporada</span>
                <select
                  aria-label="Seleccionar temporada"
                  value={selectedSeasonKey}
                  onChange={(event) => handleSeasonChange(Number(event.target.value.split(':')[1]))}
                  className="min-h-11 min-w-52 rounded-lg border border-white/10 bg-[#1f2937] px-4 text-white outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
                >
                  {languageTopics.map(({ topicId }, index) => (
                    <option key={`season-${selectedLanguage}-${topicId}`} value={`${selectedLanguage}:${topicId}`}>
                      Temporada {index + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {error ? (
          error === EMPTY_SEASON_ERROR ? (
            <div
              role="alert"
              className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-5 py-6 text-center"
            >
              <p className="text-sm text-sky-100">{EMPTY_SEASON_ERROR}</p>
              <a
                href="https://t.me/Kaergsty/2029"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sky-300/30 bg-sky-500/20 px-4 text-sm font-semibold text-sky-100 transition-colors hover:bg-sky-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M21.7 4.3a1.5 1.5 0 0 0-1.6-.3L3.2 10.6c-1.1.4-1.1 1.1-.2 1.4l4.3 1.3 1.6 5c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.1-2 4.4 3.2c.8.4 1.4.2 1.6-.8l2.9-13.5c.2-.8-.3-1.2-.9-1.2ZM8 13l9.5-6c.5-.3 1-.1.6.2l-7.8 7-.3 3.2L8 13Z" />
                </svg>
                Avisar al administrador
              </a>
            </div>
          ) : (
            <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              No se pudieron cargar los episodios: {error}
            </p>
          )
        ) : episodes.length === 0 && !error && isLoadingInitialEpisodes ? (
          <p role="status" className="py-8 text-sm text-gray-400">Cargando episodios...</p>
        ) : episodes.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {episodes.map((episode) => (
              <Link
                key={`episode-${episode.topicId}-${episode.id}`}
                href={`/ver/${encodeURIComponent(anime.id)}/${episode.id}?topic=${episode.topicId}&language=${episode.language}`}
                className="group min-w-0 rounded-xl border border-white/10 bg-[#1a1c23] p-3 transition-colors hover:border-primary/60 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
              >
                <EpisodeThumbnail client={client} message={episode.message} label={episode.label} />
                <span className="mt-2 block truncate text-sm font-semibold text-white">{episode.label}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-white/10 bg-[#1a1c23] px-5 py-8 text-center text-sm text-gray-400">
            No hay episodios disponibles para este anime.
          </p>
        )}
      </section>

      {anime && <CommentSection animeId={anime.id} title={anime.title} />}
    </main>
  );
}
