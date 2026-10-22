'use client';

import AnimeCatalogGrid from '@/components/anime/AnimeCatalogGrid';
import ActivitySection from '@/components/anime/ActivitySection';
import HeroBanner from '@/components/anime/HeroBanner';
import RecentEpisodeCard from '@/components/anime/RecentEpisodeCard';
import { useSharedAnimeData } from '@/context/AnimeDataContext';
import { useRecentEpisodes } from '@/hooks/useRecentEpisodes';

export default function HomePage() {
  const { animes, isLoading, error } = useSharedAnimeData();
  const {
    episodes: recentEpisodes,
    isLoading: isLoadingRecentEpisodes,
    error: recentEpisodesError,
  } = useRecentEpisodes();
  const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const diaHoy = diasSemana[new Date().getDay()];
  const normalize = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const animesEnEmision = animes.filter((anime) => normalize(anime.status).includes('emision'));
  const animesDeHoy = animesEnEmision.filter((anime) => normalize(anime.day).includes(diaHoy));
  const heroAnimes = animesDeHoy.length > 0 ? animesDeHoy : animesEnEmision;

  return (
    <main className="pb-16">
      <HeroBanner animes={heroAnimes} loading={isLoading} />
      <section
        aria-labelledby="recent-episodes-heading"
        className="mx-auto mt-10 max-w-7xl px-5 sm:px-8"
      >
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary-light">
            Recientemente actualizado
          </p>
          <h2 id="recent-episodes-heading" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Episodios
          </h2>
        </div>
        {recentEpisodesError && (
          <p role="status" className="mb-4 rounded-lg border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {recentEpisodesError}
          </p>
        )}
        {isLoadingRecentEpisodes ? (
          <div aria-label="Cargando episodios recientes" aria-busy="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} aria-hidden="true">
                <div className="aspect-video animate-pulse rounded-lg bg-gray-800" />
                <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-gray-800" />
              </div>
            ))}
          </div>
        ) : recentEpisodes.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {recentEpisodes.map((episode) => (
              <RecentEpisodeCard key={episode.id} episode={episode} isLat={episode.isLat} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-white/10 bg-[#1a1c23] px-5 py-8 text-center text-sm text-gray-400">
            No hay episodios recientes para mostrar.
          </p>
        )}
      </section>
      <ActivitySection />
      <section
        aria-labelledby="catalog-heading"
        className="relative z-10 mx-auto mt-12 max-w-7xl px-5 sm:px-8"
      >
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary-light">
              Explora y descubre
            </p>
            <h2 id="catalog-heading" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Catálogo
            </h2>
          </div>
        </div>
        {error && (
          <p role="alert" className="mb-5 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            No se pudo cargar el catálogo de Telegram: {error}
          </p>
        )}
        <AnimeCatalogGrid animes={animes.slice(0, 24)} isLoading={isLoading} />
      </section>
    </main>
  );
}
