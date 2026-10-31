'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { useTelegramImage } from '@/hooks/useTelegramImage';
import type { TelegramAnimeMessage } from '@/hooks/anime';
import { useTelegram } from '@/context/TelegramContext';
import { setAnimeInUserList, useUserAnimeLists } from '@/lib/userAnimeLists';

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
  isFavorite: initialFavorite = false,
  onToggleFavorite,
  message,
  messageId,
}: AnimeCardProps) {
  const ratioClass = aspectRatio === 'landscape' ? 'aspect-video' : 'aspect-[2/3]';
  const { imageUrl: telegramImageUrl } = useTelegramImage(message, messageId);
  const { currentUserId } = useTelegram();
  const userLists = useUserAnimeLists(currentUserId);
  const cardHref = href ?? `/anime/${encodeURIComponent(id)}`;
  const [controlledFavorite, setControlledFavorite] = useState(initialFavorite);
  const [listError, setListError] = useState<string | null>(null);
  const [isUpdatingList, setIsUpdatingList] = useState(false);
  const isFavorite = onToggleFavorite
    ? controlledFavorite
    : userLists.lists.favorites.includes(id);
  const isInWatchlist = userLists.lists.watchlist.includes(id);
  const isWatched = userLists.lists.watched.includes(id);

  useEffect(() => {
    setControlledFavorite(initialFavorite);
  }, [initialFavorite]);

  const toggleWatchlist = async () => {
    if (!currentUserId || isUpdatingList) {
      if (!currentUserId) setListError('Conecta tu sesión de Telegram para guardar tu lista.');
      return;
    }

    const nextState = !isInWatchlist;
    setListError(null);
    setIsUpdatingList(true);
    try {
      await setAnimeInUserList(currentUserId, 'watchlist', id, nextState);
    } catch (error) {
      console.error('No se pudo actualizar la lista de animes en Supabase.', error);
      setListError('No se pudo actualizar tu lista.');
    } finally {
      setIsUpdatingList(false);
    }
  };

  const toggleFavorite = async () => {
    if (onToggleFavorite) {
      onToggleFavorite(id);
      setControlledFavorite((current) => !current);
      return;
    }
    if (!currentUserId || isUpdatingList) {
      if (!currentUserId) setListError('Conecta tu sesión de Telegram para guardar tu lista.');
      return;
    }

    const nextState = !isFavorite;
    setListError(null);
    setIsUpdatingList(true);
    try {
      await setAnimeInUserList(currentUserId, 'favorites', id, nextState);
    } catch (error) {
      console.error('No se pudo actualizar la lista de favoritos en Supabase.', error);
      setListError('No se pudo actualizar tu lista.');
    } finally {
      setIsUpdatingList(false);
    }
  };

  const handleToggleWatched = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!currentUserId || isUpdatingList) {
      if (!currentUserId) setListError('Conecta tu sesión de Telegram para guardar tu lista.');
      return;
    }

    const nextState = !isWatched;
    setListError(null);
    setIsUpdatingList(true);
    try {
      await setAnimeInUserList(currentUserId, 'watched', id, nextState);
    } catch (error) {
      console.error('No se pudo actualizar la lista de vistos en Supabase.', error);
      setListError('No se pudo actualizar tu lista.');
    } finally {
      setIsUpdatingList(false);
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
          {(listError || userLists.error) && (
            <p role="alert" className="mt-2 text-xs text-red-300">
              {listError ?? userLists.error}
            </p>
          )}
          <div className="pointer-events-auto mt-3 flex items-center gap-2">
            <button
              type="button"
              aria-label={isInWatchlist ? `Quitar ${title} de mi lista` : `Añadir ${title} a mi lista`}
              aria-pressed={isInWatchlist}
              disabled={isUpdatingList}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void toggleWatchlist();
              }}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/15 bg-black/60 text-primary-light transition-colors hover:border-primary-light hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <BookmarkIcon filled={isInWatchlist} />
            </button>
            <button
              type="button"
              aria-label={isWatched ? `Desmarcar ${title} como visto` : `Marcar ${title} como visto`}
              aria-pressed={isWatched}
              title={isWatched ? 'Desmarcar como visto' : 'Marcar como visto'}
              disabled={isUpdatingList}
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
            <button
              type="button"
              aria-label={isFavorite ? `Quitar ${title} de favoritos` : `Añadir ${title} a favoritos`}
              aria-pressed={isFavorite}
              title={isFavorite ? 'En Favoritos' : 'Añadir a Favoritos'}
              disabled={isUpdatingList}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void toggleFavorite();
              }}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                isFavorite
                  ? 'border-pink-400 bg-pink-500/20 text-pink-300'
                  : 'border-white/15 bg-black/60 text-gray-300 hover:border-pink-300 hover:text-pink-300'
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} className="h-5 w-5">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
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
