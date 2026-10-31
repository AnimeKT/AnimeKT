'use client';

import { useState } from 'react';
import AnimeCatalogGrid from '@/components/anime/AnimeCatalogGrid';
import { useSharedAnimeData } from '@/context/AnimeDataContext';
import { useTelegram } from '@/context/TelegramContext';
import { useUserAnimeLists } from '@/lib/userAnimeLists';

type ListTab = 'watchlist' | 'watched' | 'favorites';

const tabs: { id: ListTab; label: string }[] = [
  { id: 'watchlist', label: 'Mi lista' },
  { id: 'watched', label: 'Vistos' },
  { id: 'favorites', label: 'Favoritos' },
];

export default function FavoritesPage() {
  const [activeTab, setActiveTab] = useState<ListTab>('watchlist');
  const { animes, isLoading, error } = useSharedAnimeData();
  const { currentUserId } = useTelegram();
  const userLists = useUserAnimeLists(currentUserId);
  const selectedIds = userLists.lists[activeTab];
  const selectedAnimes = animes.filter((anime) => selectedIds.includes(anime.id));
  const isLoadingLists = userLists.isLoading || isLoading;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 pb-16 pt-4 sm:px-8 sm:pt-6">
      {error && (
        <p role="alert" className="mb-5 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          No se pudo cargar el catálogo: {error}
        </p>
      )}
      {userLists.error && (
        <p role="alert" className="mb-5 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {userLists.error}
        </p>
      )}
      <section aria-label="Listas de anime">
        <div className="mb-6 flex flex-wrap gap-2 border-b border-white/10 pb-3" role="tablist" aria-label="Filtrar mi lista">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls="anime-list-panel"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light ${
                activeTab === tab.id
                  ? 'border-primary-light bg-primary/25 text-white'
                  : 'border-transparent bg-white/5 text-gray-400 hover:border-white/15 hover:bg-white/10 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div
          id="anime-list-panel"
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
        >
          {isLoadingLists ? (
            <AnimeCatalogGrid animes={[]} isLoading />
          ) : selectedAnimes.length > 0 ? (
            <AnimeCatalogGrid animes={selectedAnimes} isLoading={false} />
          ) : (
            <p className="rounded-xl border border-white/10 bg-[#1a1c23] px-5 py-8 text-center text-sm text-gray-400">
              No tienes animes guardados en esta sección.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
