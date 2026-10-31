'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTelegramImage } from '@/hooks/useTelegramImage';
import type { AnimeData } from '@/hooks/anime';
import { useTelegram } from '@/context/TelegramContext';
import { setAnimeInUserList, useUserAnimeLists } from '@/lib/userAnimeLists';

type HeroBannerProps = {
  animes: AnimeData[];
  loading?: boolean;
};

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

export default function HeroBanner({ animes, loading = false }: HeroBannerProps) {
  const featured = animes.filter((anime) => normalize(anime.status).includes('emision'));
  const [currentIndex, setCurrentIndex] = useState(0);
  const anime = featured[currentIndex % Math.max(featured.length, 1)];
  const { imageUrl: telegramImageUrl } = useTelegramImage(anime?.heroMessage, anime?.heroMessageId);
  const { currentUserId } = useTelegram();
  const userLists = useUserAnimeLists(currentUserId);
  const isInWatchlist = anime ? userLists.lists.watchlist.includes(anime.id) : false;
  const isWatched = anime ? userLists.lists.watched.includes(anime.id) : false;
  const isFavorite = anime ? userLists.lists.favorites.includes(anime.id) : false;
  const [listError, setListError] = useState<string | null>(null);
  const [isUpdatingList, setIsUpdatingList] = useState(false);
  const title = anime?.title ?? (loading ? 'Descubriendo historias...' : 'No hay anime en emisión');
  const description = anime?.synopsis ?? 'Los animes actualmente en emisión aparecerán aquí.';

  useEffect(() => {
    setCurrentIndex(0);
  }, [featured.length]);

  useEffect(() => {
    setListError(null);
  }, [anime?.id]);

  const selectFeatured = (index: number) => {
    setCurrentIndex((index + featured.length) % featured.length);
  };

  useEffect(() => {
    if (featured.length < 2) return;
    const timer = window.setTimeout(() => {
      setCurrentIndex((index) => (index + 1) % featured.length);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [currentIndex, featured.length]);

  const toggleWatchlist = async () => {
    if (!anime) return;
    if (!currentUserId || isUpdatingList) {
      if (!currentUserId) setListError('Conecta tu sesión de Telegram para guardar tu lista.');
      return;
    }

    const nextState = !isInWatchlist;
    setListError(null);
    setIsUpdatingList(true);
    try {
      await setAnimeInUserList(currentUserId, 'watchlist', anime.id, nextState);
    } catch (error) {
      console.error('No se pudo actualizar mi lista en Supabase.', error);
      setListError('No se pudo actualizar tu lista.');
    } finally {
      setIsUpdatingList(false);
    }
  };

  const toggleWatched = async () => {
    if (!anime) return;
    if (!currentUserId || isUpdatingList) {
      if (!currentUserId) setListError('Conecta tu sesión de Telegram para guardar tu lista.');
      return;
    }

    setListError(null);
    setIsUpdatingList(true);
    try {
      await setAnimeInUserList(currentUserId, 'watched', anime.id, !isWatched);
    } catch (error) {
      console.error('No se pudo actualizar la lista de vistos en Supabase.', error);
      setListError('No se pudo actualizar tu lista.');
    } finally {
      setIsUpdatingList(false);
    }
  };

  const toggleFavorite = async () => {
    if (!anime) return;
    if (!currentUserId || isUpdatingList) {
      if (!currentUserId) setListError('Conecta tu sesión de Telegram para guardar tu lista.');
      return;
    }

    setListError(null);
    setIsUpdatingList(true);
    try {
      await setAnimeInUserList(currentUserId, 'favorites', anime.id, !isFavorite);
    } catch (error) {
      console.error('No se pudo actualizar la lista de favoritos en Supabase.', error);
      setListError('No se pudo actualizar tu lista.');
    } finally {
      setIsUpdatingList(false);
    }
  };

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex h-[85vh] min-h-[600px] w-full items-end overflow-hidden bg-[#15121d]"
    >
      <Image
        src={telegramImageUrl ?? '/anime-placeholder.svg'}
        alt=""
        fill
        priority
        unoptimized
        sizes="100vw"
        className="absolute inset-0 z-0 object-cover object-[center_top]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 z-10 bg-gradient-to-t from-[#0d0e14] via-transparent to-transparent"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 z-10 bg-gradient-to-r from-[#0d0e14] via-[#0d0e14]/70 to-transparent sm:w-2/3 md:w-1/2"
      />

      <div className="relative z-20 flex h-full w-full flex-col items-start justify-end pb-24 pl-16 md:pb-32 md:pl-24 lg:pl-32">
        <div key={anime?.id ?? 'placeholder'} className="flex max-w-xl flex-col items-start gap-3 text-left">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary-light">
            {loading ? 'Cargando anime destacado' : anime ? 'Anime en emisión' : 'Anime destacado'}
          </p>
          <h1 id="hero-title" className={`font-sans text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl ${loading ? 'animate-pulse' : ''}`}>
            {title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-200">
            <span>{anime?.year || 'Anime'}</span>
            <span aria-hidden="true" className="text-gray-500">•</span>
            <span>{anime?.audio ?? 'Sub / Dub'}</span>
            <span aria-hidden="true" className="text-gray-500">•</span>
            <span>{anime?.genresText ?? '12 episodios'}</span>
          </div>
          <p className="line-clamp-2 text-xs leading-6 text-gray-300 md:text-sm">
            {description}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={anime ? `/anime/${anime.id}` : '/home'}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-bold text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M6.25 3.9a.75.75 0 0 1 1.13-.65l9.1 5.35a1.62 1.62 0 0 1 0 2.8l-9.1 5.35a.75.75 0 0 1-1.13-.65V3.9Z" />
              </svg>
              Detalles
            </Link>
            <button
              type="button"
              aria-label={isInWatchlist ? 'Quitar de Mi lista' : 'Añadir a Mi lista'}
              aria-pressed={isInWatchlist}
              title={isInWatchlist ? 'En Mi lista' : 'Añadir a Mi lista'}
              disabled={isUpdatingList}
              onClick={() => void toggleWatchlist()}
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light ${
                isInWatchlist
                  ? 'border-primary-light bg-primary/25 text-primary-light'
                  : 'border-primary bg-black/25 text-white hover:bg-primary/20'
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill={isInWatchlist ? 'currentColor' : 'none'} className="h-5 w-5">
                <path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-3.75L6 21V4.75Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={isWatched ? 'Desmarcar como visto' : 'Marcar como visto'}
              aria-pressed={isWatched}
              title={isWatched ? 'Visto' : 'Marcar como visto'}
              disabled={isUpdatingList}
              onClick={() => void toggleWatched()}
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light ${
                isWatched
                  ? 'border-green-500/50 bg-green-600/20 text-green-300'
                  : 'border-white/20 bg-black/25 text-white hover:bg-white/10'
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                {isWatched ? (
                  <path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <>
                    <path d="M2.5 12s3.2-6 9.5-6 9.5 6 9.5 6-3.2 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.8" />
                    <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
                  </>
                )}
              </svg>
            </button>
            <button
              type="button"
              aria-label={isFavorite ? 'Quitar de Favoritos' : 'Añadir a Favoritos'}
              aria-pressed={isFavorite}
              title={isFavorite ? 'En Favoritos' : 'Añadir a Favoritos'}
              disabled={isUpdatingList}
              onClick={() => void toggleFavorite()}
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 ${
                isFavorite
                  ? 'border-pink-400/50 bg-pink-500/20 text-pink-300'
                  : 'border-white/20 bg-black/25 text-white hover:border-pink-300 hover:text-pink-300'
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} className="h-5 w-5">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          {(listError || userLists.error) && (
            <p role="alert" className="text-sm text-red-300">
              {listError ?? userLists.error}
            </p>
          )}
        </div>
      </div>
      {featured.length > 1 && (
        <div className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 transform gap-2" aria-label="Animes destacados">
          {featured.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Mostrar ${item.title}`}
              aria-current={currentIndex === index}
              onClick={() => setCurrentIndex(index)}
              className="group h-1.5 w-8 overflow-hidden rounded-full bg-white/30"
            >
              {currentIndex === index && (
                <span
                  key={`${item.id}-${currentIndex}`}
                  className="block h-full origin-left rounded-full bg-primary-light"
                  style={{ animation: 'hero-indicator-progress 5s linear forwards' }}
                />
              )}
            </button>
          ))}
        </div>
      )}
      {featured.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Anime destacado anterior"
            onClick={() => selectFeatured(currentIndex - 1)}
            className="absolute left-4 top-1/2 z-30 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-10 w-10">
              <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Siguiente anime destacado"
            onClick={() => selectFeatured(currentIndex + 1)}
            className="absolute right-4 top-1/2 z-30 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-10 w-10">
              <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      )}
    </section>
  );
}
