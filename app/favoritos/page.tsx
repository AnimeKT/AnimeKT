'use client';

import { useEffect, useState } from 'react';
import AnimeCatalogGrid from '@/components/anime/AnimeCatalogGrid';
import { useSharedAnimeData } from '@/context/AnimeDataContext';

const FAVORITES_KEY = 'mis_favoritos';

export default function FavoritesPage() {
  const { animes, isLoading, error } = useSharedAnimeData();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [hasLoadedFavorites, setHasLoadedFavorites] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]') as unknown;
      if (Array.isArray(saved) && saved.every((id) => typeof id === 'string')) {
        setFavoriteIds(saved);
      } else {
        console.error('La lista local de favoritos tiene un formato no válido.');
      }
    } catch (loadError) {
      console.error('No se pudo leer la lista local de favoritos.', loadError);
    } finally {
      setHasLoadedFavorites(true);
    }
  }, []);

  const favoriteAnimes = animes.filter((anime) => favoriteIds.includes(anime.id));

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 pb-16 pt-10 sm:px-8">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary-light">
        Tu colección
      </p>
      <h1 className="mb-6 text-3xl font-bold tracking-tight text-white sm:text-4xl">Mi lista</h1>
      {error && (
        <p role="alert" className="mb-5 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          No se pudo cargar tu lista: {error}
        </p>
      )}
      {hasLoadedFavorites && !isLoading && !error && favoriteAnimes.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-[#1a1c23] px-5 py-8 text-center text-sm text-gray-400">
          Todavía no has añadido animes a tu lista.
        </p>
      ) : (
        <AnimeCatalogGrid animes={favoriteAnimes} isLoading={!hasLoadedFavorites || isLoading} />
      )}
    </main>
  );
}
