'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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

export default function AnimeCoverPage() {
  const { id } = useParams<{ id: string }>();
  const { animes, isLoading: isLoadingAnime } = useSharedAnimeData();
  const { client, isLoading: isTelegramLoading } = useTelegram();
  const anime = useMemo(
    () => animes.find((item) => item.id === id || item.message.id === Number(id) || item.heroMessage.id === Number(id)),
    [animes, id],
  );
  const { imageUrl } = useTelegramImage(anime?.message);
  const { imageUrl: bannerImageUrl } = useTelegramImage(anime?.heroMessage);
  const [episodes, setEpisodes] = useState<EpisodeLink[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<'Sub' | 'Dub'>('Sub');
  const [selectedSeasonKey, setSelectedSeasonKey] = useState('');
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);

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
    setSelectedLanguage(language);
    const firstTopic = episodeTopics.find((topic) => topic.language === language);
    setSelectedSeasonKey(firstTopic ? `${firstTopic.language}:${firstTopic.topicId}` : '');
  };

  const handleSeasonChange = (topicId: number) => {
    setSelectedSeasonKey(`${selectedLanguage}:${topicId}`);
  };

  useEffect(() => {
    if (!anime) return;
    const favorites = JSON.parse(localStorage.getItem('mis_favoritos') || '[]') as string[];
    setIsFavorite(favorites.includes(anime.id));
  }, [anime]);

  useEffect(() => {
    let cancelled = false;
    if (!client || !anime || !selectedSeason) {
      setEpisodes([]);
      setError(null);
      return;
    }

    const loadEpisodes = async () => {
      setIsLoadingEpisodes(true);
      setError(null);
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
        if (!cancelled) setEpisodes(selectedEpisodes);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (!cancelled) setIsLoadingEpisodes(false);
      }
    };

    void loadEpisodes();
    return () => {
      cancelled = true;
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
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              aria-pressed={isFavorite}
              onClick={toggleFavorite}
              className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
            >
              {isFavorite ? '✓ En mi lista' : '＋ Agregar a Lista'}
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
        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            No se pudieron cargar los episodios: {error}
          </p>
        )}
        {isLoadingEpisodes ? (
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

      <CommentSection />
    </main>
  );
}
