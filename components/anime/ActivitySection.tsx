'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSharedAnimeData } from '@/context/AnimeDataContext';
import { useTelegram } from '@/context/TelegramContext';
import { useRecentCommentActivity } from '@/hooks/useRecentCommentActivity';
import type { AnimeData } from '@/hooks/anime';
import { getCachedProfilePicUrl } from '@/lib/telegramComments';
import type { RecentCommentActivity } from '@/lib/telegramComments';

function formatRelativeTime(timestamp: number) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) return 'hace un momento';
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `hace ${elapsedMinutes} min`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `hace ${elapsedHours} horas`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `hace ${elapsedDays} días`;
}

function formatActivityEpisodeTitle(
  animeName: string,
  activity: RecentCommentActivity,
  anime?: AnimeData,
) {
  const episodeMatch = activity.episodeLabel?.match(
    /(?:episodio|ep)\s*(\d+(?:\.\d+)?)|-\s*(\d+(?:\.\d+)?)$/i,
  );
  const parsedEpisodeNumber = episodeMatch?.[1] ?? episodeMatch?.[2];
  const episodeNumber = parsedEpisodeNumber ? Number(parsedEpisodeNumber) : Number.NaN;
  const formattedEp = Number.isFinite(episodeNumber) && episodeNumber <= 1000
    ? String(parsedEpisodeNumber).padStart(2, '0')
    : '[Desconocido]';
  let seasonNumber = 1;

  if (anime && activity.episodeTopicId) {
    const topicId = Number(activity.episodeTopicId);
    const topicLists = activity.episodeLanguage === 'Dub'
      ? [anime.topicsDub]
      : activity.episodeLanguage === 'Sub'
        ? [anime.topicsSub]
        : [anime.topicsSub, anime.topicsDub];
    const seasonIndex = topicLists
      .map((topics) => topics.indexOf(topicId))
      .find((index) => index >= 0);
    if (seasonIndex !== undefined) seasonNumber = seasonIndex + 1;
  }

  return `${animeName} S${seasonNumber}-${formattedEp}`;
}

function ActivityAvatar({ activity }: { activity: RecentCommentActivity }) {
  const { getProfilePic } = useTelegram();
  const [profileUrl, setProfileUrl] = useState<string | null>(
    () => getCachedProfilePicUrl(activity.userId),
  );

  useEffect(() => {
    let cancelled = false;
    void getProfilePic(activity.userId).then((url) => {
      if (!url) return;
      if (!cancelled) setProfileUrl(url);
    }).catch((error: unknown) => {
      console.error(`No se pudo cargar el avatar de ${activity.username}.`, error);
    });

    return () => {
      cancelled = true;
    };
  }, [activity.userId, activity.username, getProfilePic]);

  return (
    <span
      aria-hidden="true"
      className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-cyan-500 to-blue-700 text-sm font-bold text-white"
    >
      {profileUrl ? (
        <img src={profileUrl} alt="" className="h-full w-full object-cover" />
      ) : activity.avatar}
    </span>
  );
}

export default function ActivitySection() {
  const { activities, isLoading, error } = useRecentCommentActivity();
  const { animes } = useSharedAnimeData();
  const [filter, setFilter] = useState<'recientes' | 'populares'>('recientes');
  const orderedActivities = filter === 'populares'
    ? [...activities]
      .filter((activity) => activity.likes > 0)
      .sort((first, second) => second.likes - first.likes)
    : [...activities].sort((first, second) => second.timestamp - first.timestamp);
  const visibleActivities = orderedActivities.slice(0, 4);

  if (activities.length === 0) return null;

  const getActivityHref = (activity: RecentCommentActivity) => {
    const route = activity.episodeId
      ? `/ver/${encodeURIComponent(activity.animeId)}/${encodeURIComponent(activity.episodeId)}`
      : `/anime/${encodeURIComponent(activity.animeId)}`;
    const query = new URLSearchParams();
    if (activity.episodeTopicId) query.set('topic', activity.episodeTopicId);
    if (activity.episodeLanguage) query.set('language', activity.episodeLanguage);
    const queryString = query.toString();
    const commentAnchor = `#comment-${encodeURIComponent(activity.id)}`;
    return `${route}${queryString ? `?${queryString}` : ''}${activity.episodeId ? commentAnchor : ''}`;
  };

  return (
    <section
      aria-labelledby="recent-activity-heading"
      className="mx-auto mt-12 max-w-7xl px-5 sm:px-8"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <h2 id="recent-activity-heading" className="text-2xl font-bold text-white">
            Actividad
          </h2>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Últimos comentarios
          </p>
        </div>
        <div className="flex gap-1 rounded-full bg-[#1a1a2e] p-1">
          <button
            type="button"
            aria-pressed={filter === 'recientes'}
            onClick={() => setFilter('recientes')}
            className={`rounded-full px-4 py-1 text-sm font-medium transition-all ${
              filter === 'recientes' ? 'bg-[#2a2a3e] text-teal-400' : 'text-gray-400'
            }`}
          >
            Recientes
          </button>
          <button
            type="button"
            aria-pressed={filter === 'populares'}
            onClick={() => setFilter('populares')}
            className={`rounded-full px-4 py-1 text-sm font-medium transition-all ${
              filter === 'populares' ? 'bg-[#2a2a3e] text-teal-400' : 'text-gray-400'
            }`}
          >
            Populares
          </button>
        </div>
      </div>
      {error && (
        <p role="status" className="mb-4 rounded-lg border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </p>
      )}
      {!isLoading && filter === 'populares' && visibleActivities.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          Aún no hay comentarios destacados. ¡Sé el primero en reaccionar a un comentario!
        </p>
      ) : !isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {visibleActivities.map((activity) => {
            const anime = animes.find((item) => item.id === activity.animeId);
            return (
              <Link
                key={`${activity.id}-${activity.animeId}`}
                href={getActivityHref(activity)}
                className="flex min-w-0 cursor-pointer flex-col rounded-xl border border-white/10 bg-[#1a1c23] p-4 transition-colors hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <div className="mb-3 flex min-w-0 items-center gap-3">
                  <ActivityAvatar activity={activity} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{activity.username}</p>
                    <p className="text-xs text-gray-400">{formatRelativeTime(activity.timestamp)}</p>
                  </div>
                </div>
                <p className="line-clamp-4 min-h-20 whitespace-pre-line break-words text-sm leading-5 text-gray-300">
                  {activity.text || (activity.hasImage ? 'Imagen adjunta' : 'Comentario')}
                  {activity.hasImage && <span aria-label="Imagen adjunta"> {'🖼️'}</span>}
                </p>
                <span className="mt-4 inline-flex min-w-0 items-center gap-2 border-t border-white/10 pt-3 text-sm font-semibold text-cyan-300 transition-colors">
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0 fill-current">
                    <path d="M4 2.8a.8.8 0 0 1 1.2-.7l7.2 4.4a1.7 1.7 0 0 1 0 2.9l-7.2 4.4a.8.8 0 0 1-1.2-.7V2.8Z" />
                  </svg>
                  <span className="truncate">
                    {activity.episodeId
                      ? formatActivityEpisodeTitle(anime?.title ?? activity.animeTitle, activity, anime)
                      : anime?.title ?? activity.animeTitle}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
