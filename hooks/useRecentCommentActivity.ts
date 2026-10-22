'use client';

import { useEffect, useState } from 'react';
import localforage from 'localforage';
import { useSharedAnimeData } from '@/context/AnimeDataContext';
import { useTelegram } from '@/context/TelegramContext';
import {
  fetchRecentCommentActivity,
  type RecentCommentActivity,
} from '@/lib/telegramComments';

const ACTIVITY_CACHE_KEY = 'recent_comment_activity_swr_v1';
const REVALIDATE_INTERVAL_MS = 60_000;
const activityMemoryCache = new Map<string, RecentCommentActivity[]>();

function isRecentCommentActivity(value: unknown): value is RecentCommentActivity {
  if (!value || typeof value !== 'object') return false;
  const activity = value as RecentCommentActivity;
  return typeof activity.id === 'string' &&
    typeof activity.username === 'string' &&
    typeof activity.avatar === 'string' &&
    typeof activity.text === 'string' &&
    typeof activity.hasImage === 'boolean' &&
    typeof activity.timestamp === 'number' &&
    typeof activity.animeId === 'string' &&
    typeof activity.animeTitle === 'string' &&
    (activity.episodeId === null || typeof activity.episodeId === 'string') &&
    (activity.episodeLabel === null || typeof activity.episodeLabel === 'string') &&
    (activity.episodeTopicId === null || typeof activity.episodeTopicId === 'string') &&
    (activity.episodeLanguage === null || activity.episodeLanguage === 'Sub' || activity.episodeLanguage === 'Dub') &&
    (activity.likes === undefined || typeof activity.likes === 'number') &&
    (activity.dislikes === undefined || typeof activity.dislikes === 'number');
}

function withReactionCounts(activities: RecentCommentActivity[]) {
  return activities.map((activity) => ({
    ...activity,
    likes: activity.likes ?? 0,
    dislikes: activity.dislikes ?? 0,
  }));
}

export function useRecentCommentActivity() {
  const { animes, isLoading: isAnimeLoading } = useSharedAnimeData();
  const { client, isLoading: isTelegramLoading } = useTelegram();
  const [activities, setActivities] = useState<RecentCommentActivity[]>(
    () => withReactionCounts(activityMemoryCache.get(ACTIVITY_CACHE_KEY) ?? []),
  );
  const [isLoading, setIsLoading] = useState(
    () => !activityMemoryCache.has(ACTIVITY_CACHE_KEY),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: number | undefined;
    let isRefreshing = false;

    const refresh = async () => {
      if (isRefreshing || isTelegramLoading || isAnimeLoading) return;
      if (!client) {
        setError('No hay una sesión de Telegram activa para cargar la actividad reciente.');
        setIsLoading(false);
        return;
      }

      isRefreshing = true;
      setError(null);
      try {
        const animeInfo = new Map(animes.map((anime) => [
          anime.id,
          { title: anime.title, topicsSub: anime.topicsSub, topicsDub: anime.topicsDub },
        ]));
        const latest = await fetchRecentCommentActivity(client, animeInfo);
        if (cancelled) return;
        const normalizedLatest = withReactionCounts(latest);
        setActivities(normalizedLatest);
        activityMemoryCache.set(ACTIVITY_CACHE_KEY, normalizedLatest);
        try {
          await localforage.setItem(ACTIVITY_CACHE_KEY, normalizedLatest);
        } catch (cacheError: unknown) {
          console.error('No se pudo guardar la caché de actividad reciente.', cacheError);
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        isRefreshing = false;
        if (!cancelled) setIsLoading(false);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    const startRevalidation = () => {
      if (cancelled) return;
      void refresh();
      refreshTimer = window.setInterval(() => void refresh(), REVALIDATE_INTERVAL_MS);
      window.addEventListener('focus', onVisibilityChange);
      document.addEventListener('visibilitychange', onVisibilityChange);
    };

    if (activityMemoryCache.has(ACTIVITY_CACHE_KEY)) {
      startRevalidation();
    } else {
      void localforage.getItem<unknown>(ACTIVITY_CACHE_KEY)
        .then((cached) => {
          if (cancelled || !Array.isArray(cached)) return;
          const validActivities = withReactionCounts(cached.filter(isRecentCommentActivity));
          if (validActivities.length > 0 && !activityMemoryCache.has(ACTIVITY_CACHE_KEY)) {
            activityMemoryCache.set(ACTIVITY_CACHE_KEY, validActivities);
            setActivities(validActivities);
          }
        })
        .catch((cacheError: unknown) => {
          console.error('No se pudo leer la caché de actividad reciente.', cacheError);
        })
        .finally(startRevalidation);
    }

    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
      window.removeEventListener('focus', onVisibilityChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [animes, client, isAnimeLoading, isTelegramLoading]);

  return { activities, isLoading: isLoading && activities.length === 0, error };
}
