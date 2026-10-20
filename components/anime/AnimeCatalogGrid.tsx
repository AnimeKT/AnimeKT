'use client';

import AnimeCard from '@/components/anime/AnimeCard';
import type { AnimeData } from '@/hooks/anime';

type AnimeCatalogGridProps = {
  animes: AnimeData[];
  isLoading: boolean;
};

function SkeletonLoader() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="aspect-[2/3] rounded-xl bg-white/10" />
      <div className="mt-3 h-4 w-3/4 rounded bg-white/10" />
    </div>
  );
}

export default function AnimeCatalogGrid({ animes, isLoading }: AnimeCatalogGridProps) {
  if (isLoading) {
    return (
      <div
        aria-label="Cargando catálogo"
        aria-busy="true"
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-6"
      >
        {Array.from({ length: 12 }, (_, index) => <SkeletonLoader key={index} />)}
      </div>
    );
  }

  if (animes.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-8 text-center text-sm text-gray-400">
        No se encontraron animes con imágenes en el tema de Telegram.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-6">
      {animes.map((anime) => (
        <AnimeCard
          key={anime.id}
          id={anime.id}
          title={anime.title}
          imageUrl="/anime-placeholder.svg"
          message={anime.message}
          description={anime.synopsis}
          genres={anime.genres}
          alternativeTitles={anime.alternativeTitles}
          meta={anime.meta}
          status={anime.status}
        />
      ))}
    </div>
  );
}
