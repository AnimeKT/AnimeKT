'use client';

import { useEffect, useState } from 'react';
import { useSharedAnimeData } from '@/context/AnimeDataContext';
import { useTelegram } from '@/context/TelegramContext';
import type { AnimeData, TelegramAnimeMessage } from '@/hooks/anime';
import { extractAnimeData } from '@/hooks/useAnimeData';
import { getTelegramMessageText } from '@/hooks/telegramMessageText';

const NOTIFICATION_CHANNEL = 'AnimeKaergsty';
const MAX_RECENT_EPISODES = 20;
const RECENT_MESSAGE_SCAN_LIMIT = 500;

export type RecentEpisode = {
  id: number;
  fileId: number;
  message: TelegramAnimeMessage;
  anime: AnimeData;
  title: string;
  isLat: boolean;
  label: string;
  publishedAt: number;
  relativeTime: string;
};

function normalizeText(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function getEpisodeData(message: TelegramAnimeMessage) {
  const rawText = getTelegramMessageText(message);
  const normalText = rawText.normalize('NFKC');
  const capMatch = normalText.match(/C\s*A\s*P\s*-\s*([0-9\.]+)/i) ||
    normalText.match(/EPISODIO N[°o]\s*([0-9\.]+)/i);
  const titleMatch = normalText.match(/(?:^|\n)\s*\*{0,2}\s*Anime\s*\*{0,2}\s*:\s*\*{0,2}\s*(.+)/im);
  if (!capMatch || !titleMatch) return null;

  const isLat = rawText.includes('🇲🇽');
  const cleanTitle = titleMatch[1].replace(/\*+$/g, '').replace('🇲🇽', '').trim();
  const media = message.media;
  const hasDocument = Boolean(media && (
    media.className === 'MessageMediaDocument' ||
    'document' in media
  ));
  const hasPhoto = Boolean(media && (
    media.className === 'MessageMediaPhoto' ||
    'photo' in media
  ));

  if ((!hasDocument && !hasPhoto) || !message.replyMarkup || !('rows' in message.replyMarkup)) return null;

  const buttonUrl = message.replyMarkup.rows
    .flatMap((row) => row.buttons)
    .find((button) => 'url' in button && typeof button.url === 'string' && button.url.length > 0);
  const url = buttonUrl && 'url' in buttonUrl ? buttonUrl.url : undefined;

  let fileId: number;
  try {
    const idSegment = url ? new URL(url).pathname.split('/').filter(Boolean).pop() : undefined;
    fileId = Number(idSegment);
  } catch {
    return null;
  }
  if (!Number.isSafeInteger(fileId) || fileId <= 0) return null;

  return { title: cleanTitle, isLat, label: `Episodio ${capMatch[1]}`, fileId };
}

function formatRelativeTime(date: Date) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (elapsedSeconds < 60) return 'hace un momento';
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `hace ${elapsedMinutes} min`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `hace ${elapsedHours} horas`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `hace ${elapsedDays} días`;
}

function getTitleWords(title: string) {
  return title
    .normalize('NFKC')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/(?:\s*season\s*\d+|\s*temporada\s*\d+|\s*[st]\s*\d+)$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeTitle(title: string) {
  return getTitleWords(title).join('');
}

function titleSimilarity(first: string, second: string) {
  const firstWords = new Set(getTitleWords(first));
  const secondWords = new Set(getTitleWords(second));
  if (firstWords.size < 3 || secondWords.size < 3) return 0;

  let sharedWords = 0;
  for (const word of firstWords) {
    if (secondWords.has(word)) sharedWords += 1;
  }
  return (2 * sharedWords) / (firstWords.size + secondWords.size);
}

function findAnimeByTitle(title: string, animes: AnimeData[]) {
  const normalizedTitle = normalizeTitle(title);
  const candidates = animes.map((anime) => ({
    anime,
    titles: [anime.title, ...anime.alternativeTitles.split(/\s*[|;]\s*|\s+-\s*/)]
      .map(normalizeTitle)
      .filter(Boolean),
  }));

  const exactMatch = candidates.find(({ titles }) => titles.includes(normalizedTitle));
  if (exactMatch) return exactMatch.anime;

  const rankedCandidates = candidates
    .map(({ anime, titles }) => ({
      anime,
      score: Math.max(0, ...titles.map((candidate) => titleSimilarity(normalizedTitle, candidate))),
    }))
    .sort((first, second) => second.score - first.score);
  const best = rankedCandidates[0];
  const runnerUp = rankedCandidates[1];

  if (!best || best.score < 0.78 || (runnerUp && best.score - runnerUp.score < 0.08)) {
    return undefined;
  }
  return best.anime;
}

function createNotificationAnime(title: string, message: TelegramAnimeMessage): AnimeData {
  return {
    id: 'notification',
    message,
    heroMessage: message,
    ...extractAnimeData(`Título: ${title}`),
  };
}

export function useRecentEpisodes() {
  const { animes, isLoading: isAnimeLoading } = useSharedAnimeData();
  const { client, isLoading: isTelegramLoading } = useTelegram();
  const [episodes, setEpisodes] = useState<RecentEpisode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (isTelegramLoading || isAnimeLoading) {
      setIsLoading(true);
      return () => {
        cancelled = true;
      };
    }

    if (!client) {
      setEpisodes([]);
      setError('No hay una sesión de Telegram activa para cargar episodios recientes.');
      setIsLoading(false);
      return;
    }

    if (animes.length === 0) {
      setEpisodes([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const loadEpisodes = async () => {
      setIsLoading(true);
      setError(null);
      try {
        await client.connect();
        const messages = await client.getMessages(NOTIFICATION_CHANNEL, {
          limit: RECENT_MESSAGE_SCAN_LIMIT,
        });
        if (cancelled) return;

        const recentEpisodes = messages.flatMap((message) => {
          const parsed = getEpisodeData(message);
          if (!parsed) return [];

          const anime = findAnimeByTitle(parsed.title, animes) ??
            createNotificationAnime(parsed.title, message);

          const publishedDate = new Date(message.date * 1000);
          return [{
            id: message.id,
            fileId: parsed.fileId,
            message,
            anime,
            title: parsed.title,
            isLat: parsed.isLat,
            label: parsed.label,
            publishedAt: publishedDate.getTime(),
            relativeTime: formatRelativeTime(publishedDate),
          }];
        })
          .sort((first, second) => second.publishedAt - first.publishedAt)
          .slice(0, MAX_RECENT_EPISODES);

        setEpisodes(recentEpisodes);
      } catch (loadError) {
        if (cancelled) return;
        setEpisodes([]);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadEpisodes();
    return () => {
      cancelled = true;
    };
  }, [animes, client, isAnimeLoading, isTelegramLoading]);

  return { episodes, isLoading, error };
}
