'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useAnimeData } from '@/hooks/useAnimeData';
import type { AnimeData } from '@/hooks/anime';

type AnimeDataContextValue = {
  animes: AnimeData[];
  isLoading: boolean;
  error: string | null;
};

const AnimeDataContext = createContext<AnimeDataContextValue | undefined>(undefined);

export function AnimeDataProvider({ children }: Readonly<{ children: ReactNode }>) {
  const animeData = useAnimeData();
  return <AnimeDataContext.Provider value={animeData}>{children}</AnimeDataContext.Provider>;
}

export function useSharedAnimeData() {
  const context = useContext(AnimeDataContext);
  if (!context) throw new Error('useSharedAnimeData debe usarse dentro de AnimeDataProvider.');
  return context;
}
