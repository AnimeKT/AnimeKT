'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { useTelegramImage } from '@/hooks/useTelegramImage';
import type { TelegramAnimeMessage } from '@/hooks/anime';

type AnimeCardProps = {
  id: string;
  title: string;
  alternativeTitles?: string;
  meta?: string;
  status?: string;
  imageUrl: string;
  description?: string;
  genres?: string[];
  rating?: string | number;
  href?: string;
  aspectRatio?: 'portrait' | 'landscape';
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  message?: TelegramAnimeMessage;
  messageId?: number;
};

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      className="h-5 w-5"
    >
      <path
        d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-3.75L6 21V4.75Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AnimeCard({
  id,
  title,
  alternativeTitles = '',
  meta = '',
  status,
  imageUrl,
  description,
  genres = [],
  rating,
  href,
  aspectRatio = 'portrait',
  isFavorite = false,
  onToggleFavorite,
  message,
  messageId,
}: AnimeCardProps) {
  const ratioClass = aspectRatio === 'landscape' ? 'aspect-video' : 'aspect-[2/3]';
  const { imageUrl: telegramImageUrl } = useTelegramImage(message, messageId);
  const cardHref = href ?? `/anime/${encodeURIComponent(id)}`;
  const [favorite, setFavorite] = useState(isFavorite);
  const [isWatched, setIsWatched] = useState(false);

  useEffect(() => {
    setFavorite(isFavorite);
  }, [isFavorite]);

  useEffect(() => {
    if (onToggleFavorite || typeof window === 'undefined') return;
    const favorites = JSON.parse(localStorage.getItem('mis_favoritos') || '[]') as string[];
    setFavorite(favorites.includes(id));
  }, [id, onToggleFavorite]);

  useEffect(() => {
    try {
      const storedWatched: unknown = JSON.parse(localStorage.getItem('animes_vistos') || '[]');
      setIsWatched(Array.isArray(storedWatched) && storedWatched.includes(id));
    } catch (error) {
      console.error('No se pudo leer la lista de animes vistos.', error);
      setIsWatched(false);
    }
  }, [id]);

  const toggleFavorite = () => {
    if (onToggleFavorite) {
      onToggleFavorite(id);
      setFavorite((current) => !current);
      return;
    }
    const favorites = JSON.parse(localStorage.getItem('mis_favoritos') || '[]') as string[];
    const next = favorites.includes(id)
      ? favorites.filter((favoriteId) => favoriteId !== id)
      : [...favorites, id];
    localStorage.setItem('mis_favoritos', JSON.stringify(next));
    setFavorite(!favorites.includes(id));
  };

  const handleToggleWatched = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const previousState = isWatched;
    const nextState = !previousState;
    setIsWatched(nextState);

    try {
      const storedWatched: unknown = JSON.parse(localStorage.getItem('animes_vistos') || '[]');
      const watchedAnime = Array.isArray(storedWatched)
        ? storedWatched.filter((animeId): animeId is string => typeof animeId === 'string')
        : [];
      const nextWatched = nextState
        ? [...new Set([...watchedAnime, id])]
        : watchedAnime.filter((animeId) => animeId !== id);
      localStorage.setItem('animes_vistos', JSON.stringify(nextWatched));
    } catch (error) {
      console.error('Error al actualizar el estado de visto:', error);
      setIsWatched(previousState);
    }
  };

  return (
    <article className="group relative min-w-0">
      <div className={`group/card relative ${ratioClass} isolate overflow-hidden rounded-xl bg-surface shadow-lg shadow-black/20 transition-all duration-300 ease-out hover:z-10 hover:scale-105 hover:shadow-2xl hover:shadow-black/40`}>
        <Link
          href={cardHref}
          aria-label={`Ver ${title}`}
          className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
        >
          <Image
            src={telegramImageUrl ?? imageUrl}
            alt={`${title} poster`}
            fill
            unoptimized
            sizes={aspectRatio === 'landscape' ? '(max-width: 640px) 85vw, (max-width: 1024px) 50vw, 33vw' : '(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 16vw'}
            className="object-cover transition-transform duration-500 ease-out group-hover/card:scale-110"
          />
        </Link>
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col overflow-hidden bg-black/95 p-3 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 group-focus-within:opacity-100">
          <h3 className="truncate text-lg font-bold text-white">{title}</h3>
          {alternativeTitles && (
            <p className="mb-1 truncate text-xs text-gray-400">{alternativeTitles}</p>
          )}
          <div className="mb-1 flex flex-wrap gap-x-1.5 gap-y-0.5 text-xs text-gray-400">
            {meta && <span>{meta}</span>}
            {status && <span>{status}</span>}
            {genres.slice(0, 3).map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
            {rating !== undefined && <span className="text-amber-300">★ {rating}</span>}
          </div>
          <p className="line-clamp-5 flex-1 overflow-hidden text-xs text-gray-300">
            {description}
          </p>
          <div className="pointer-events-auto mt-3 flex items-center gap-2">
            <button
              type="button"
              aria-label={favorite ? `Quitar ${title} de mi lista` : `Añadir ${title} a mi lista`}
              aria-pressed={favorite}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleFavorite();
              }}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/15 bg-black/60 text-primary-light transition-colors hover:border-primary-light hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <BookmarkIcon filled={favorite} />
            </button>
            <button
              type="button"
              aria-label={isWatched ? `Desmarcar ${title} como visto` : `Marcar ${title} como visto`}
              aria-pressed={isWatched}
              title={isWatched ? 'Desmarcar como visto' : 'Marcar como visto'}
              onClick={(event) => void handleToggleWatched(event)}
              className={`shrink-0 rounded-md border p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                isWatched
                  ? 'border-green-600/50 bg-green-600/20 text-green-400 hover:bg-green-600/30'
                  : 'border-gray-600 bg-black/50 text-gray-300 hover:bg-black/80 hover:text-white'
              }`}
            >
              {isWatched ? (
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
      <Link
        href={cardHref}
        aria-label={`Ver ${title}`}
        className="block rounded-b-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
      >
        <h2 className="mt-2 truncate text-sm font-semibold text-gray-100 transition-colors group-hover:text-primary-light sm:text-base">
          {title}
        </h2>
      </Link>
    </article>
  );
}
