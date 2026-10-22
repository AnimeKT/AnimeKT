'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTelegramImage } from '@/hooks/useTelegramImage';
import type { AnimeData } from '@/hooks/anime';

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
  const [isFavorite, setIsFavorite] = useState(false);
  const title = anime?.title ?? (loading ? 'Descubriendo historias...' : 'No hay anime en emisión');
  const description = anime?.synopsis ?? 'Los animes actualmente en emisión aparecerán aquí.';

  useEffect(() => {
    setCurrentIndex(0);
  }, [featured.length]);

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

  useEffect(() => {
    if (!anime) {
      setIsFavorite(false);
      return;
    }
    const saved = JSON.parse(localStorage.getItem('mis_favoritos') || '[]') as string[];
    setIsFavorite(saved.includes(anime.id));
  }, [anime?.id]);

  const toggleFavorite = () => {
    if (!anime) return;
    const saved = JSON.parse(localStorage.getItem('mis_favoritos') || '[]') as string[];
    const id = anime.id.toString();
    const next = saved.includes(id) ? saved.filter((favorite) => favorite !== id) : [...saved, id];
    localStorage.setItem('mis_favoritos', JSON.stringify(next));
    setIsFavorite(!saved.includes(id));
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
          <div className="flex flex-col gap-3 sm:flex-row">
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
              aria-pressed={isFavorite}
              onClick={toggleFavorite}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-primary bg-black/25 px-6 text-sm font-bold text-white transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {isFavorite ? 'En mi lista' : 'Añadir a lista'}
            </button>
          </div>
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
