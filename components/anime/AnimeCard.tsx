'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
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
}: AnimeCardProps) {
  const ratioClass = aspectRatio === 'landscape' ? 'aspect-video' : 'aspect-[2/3]';
  const { imageUrl: telegramImageUrl } = useTelegramImage(message);
  const cardHref = href ?? `/anime/${encodeURIComponent(id)}`;
  const [favorite, setFavorite] = useState(isFavorite);

  useEffect(() => {
    setFavorite(isFavorite);
  }, [isFavorite]);

  useEffect(() => {
    if (onToggleFavorite || typeof window === 'undefined') return;
    const favorites = JSON.parse(localStorage.getItem('mis_favoritos') || '[]') as string[];
    setFavorite(favorites.includes(id));
  }, [id, onToggleFavorite]);

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
          <button
            type="button"
            aria-label={favorite ? `Quitar ${title} de mi lista` : `Añadir ${title} a mi lista`}
            aria-pressed={favorite}
            onClick={toggleFavorite}
            className="pointer-events-auto mt-2 grid h-9 w-9 shrink-0 place-items-center self-start rounded-lg border border-white/15 bg-black/60 text-primary-light transition-colors hover:border-primary-light hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <BookmarkIcon filled={favorite} />
          </button>
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
