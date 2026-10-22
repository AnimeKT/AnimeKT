'use client';

import { useCallback, useEffect, useState } from 'react';
import localforage from 'localforage';
import { Api } from 'telegram/tl';
import { useTelegram } from '@/context/TelegramContext';
import type { AnimeData, TelegramAnimeMessage } from '@/hooks/anime';
import { getTelegramMessageText } from '@/hooks/telegramMessageText';

const GROUP_NAME = 'AnimeKT1';
const TOPIC_ID = 16;

type ParsedAnimeData = Omit<AnimeData, 'id' | 'messageId' | 'heroMessageId' | 'message' | 'heroMessage'>;
type CachedAnimeData = Omit<AnimeData, 'message' | 'heroMessage'>;

const ANIME_CATALOG_CACHE_KEY = 'anime_catalog_swr_v1';
const REVALIDATE_INTERVAL_MS = 60_000;

function normalize(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function extractAnimeData(text: string): ParsedAnimeData {
  if (!text) {
    return {
      title: 'Título Desconocido',
      alternativeTitles: '',
      meta: '• Subtitulado • Género desconocido',
      synopsis: 'No hay sinopsis disponible.',
      status: 'Desconocido',
      type: 'TV',
      year: '',
      day: '',
      audio: 'Subtitulado',
      studio: 'Desconocido',
      author: 'Desconocido',
      genres: [],
      genresText: 'Desconocido',
      searchableText: '',
      topicsSub: [],
      topicsDub: [],
    };
  }

  const extract = (pattern: RegExp) => text.match(pattern)?.[1]?.trim() ?? '';
  const rawTitle = extract(/Título:\s*(.+)/i) || 'Título Desconocido';
  const titleParts = rawTitle.split('|').map((part) => part.trim());
  const title = titleParts[0];
  const alternativeTitles = titleParts.length > 1 ? titleParts.slice(1).join(' - ') : '';
  const audio = extract(/Audio:\s*(.+)/i) || 'Subtitulado';
  const status = extract(/Estado:\s*(.+)/i) || 'Desconocido';
  const studio = extract(/(?:🏢\uFE0F?\s*)?Estudio:\s*(.+)/i) || 'Desconocido';
  const author = extract(/(?:✍️?\s*)?Autor:\s*(.+)/i) || 'Desconocido';
  const day = extract(/D[íi]a:\s*(.+)/i);
  const type = extract(/Tipo:\s*(.+)/i) || 'TV';
  const genresText = extract(/G[ée]neros:\s*(.+)/i) || 'Desconocido';
  const genres =
    genresText === 'Desconocido'
      ? []
      : genresText.split(',').map((genre) => genre.trim()).filter(Boolean);
  const yearMatch = text.match(/A[ñn]o\s*:\s*(\d{4})/i) ?? text.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearMatch ? (yearMatch[1] || yearMatch[0]).trim() : '';
  const synopsis = extract(/Sinopsis:\s*([\s\S]+)/i) || 'No hay sinopsis disponible.';
  const topicSubMatch = text.match(/(?:📁|\b)\s*Topic(?!2)\s*[:=]?\s*([\d\s|]+)/i);
  const topicDubMatch = text.match(/(?:📁|\b)\s*Topic2\s*[:=]?\s*([\d\s|]+)/i);
  const parseTopicIds = (match: RegExpMatchArray | null) =>
    match
      ? match[1].split('|').map((value) => Number.parseInt(value.trim(), 10)).filter(Number.isFinite)
      : [];
  const meta = `• ${audio} • ${genresText} • ${year}`;
  const searchableText = normalize([
    rawTitle,
    title,
    alternativeTitles,
    status,
    audio,
    studio,
    author,
    genresText,
    day,
    type,
    year,
    synopsis,
  ].filter(Boolean).join(' ').toLowerCase());

  return {
    title,
    alternativeTitles,
    meta,
    synopsis,
    status,
    type,
    year,
    day,
    audio,
    studio,
    author,
    genres,
    genresText,
    searchableText,
    topicsSub: parseTopicIds(topicSubMatch),
    topicsDub: parseTopicIds(topicDubMatch),
  };
}

function isImageMessage(message: TelegramAnimeMessage) {
  const media = message.media;
  return (
    media instanceof Api.MessageMediaPhoto ||
    (media instanceof Api.MessageMediaDocument &&
      media.document instanceof Api.Document &&
      media.document.mimeType.startsWith('image/'))
  );
}

function getGroupId(message: TelegramAnimeMessage) {
  return message.groupedId ? message.groupedId.toString() : String(message.id);
}

function getMessageText(message: TelegramAnimeMessage) {
  return getTelegramMessageText(message);
}

export function parseAnimeMessages(messages: TelegramAnimeMessage[]): AnimeData[] {
  const groups = new Map<string, TelegramAnimeMessage[]>();
  for (const message of messages) {
    if (!isImageMessage(message)) continue;
    const key = getGroupId(message);
    const album = groups.get(key);
    if (album) album.push(message);
    else groups.set(key, [message]);
  }

  const animes: AnimeData[] = [];
  for (const album of groups.values()) {
    album.sort((first, second) => first.id - second.id);
    const heroMessage = album[0];
    const message = album[1] ?? heroMessage;
    const combinedText = album.map(getMessageText).filter(Boolean).join('\n').trim();
    const data = extractAnimeData(combinedText);

    if (data.title === 'Título Desconocido') continue;

    animes.push({
      id: String(message.id),
      messageId: message.id,
      heroMessageId: heroMessage.id,
      message,
      heroMessage,
      ...data,
    });
  }
  return animes;
}

export function useAnimeData() {
  const { client, isLoading: isTelegramLoading } = useTelegram();
  const [animes, setAnimes] = useState<AnimeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnimes = useCallback(async (isCancelled: () => boolean) => {
    if (!client) {
      if (!isTelegramLoading) {
        setError('No hay una sesión de Telegram activa. Vuelve a iniciar sesión.');
        setIsLoading(false);
      }
      return;
    }

    try {
      await client.connect();
      const messages = await client.getMessages(GROUP_NAME, {
        replyTo: TOPIC_ID,
        limit: 500,
      });
      if (isCancelled()) return;
      const freshAnimes = parseAnimeMessages(messages);
      setAnimes(freshAnimes);
      setError(null);
      setIsLoading(false);

      const cache: CachedAnimeData[] = freshAnimes.map(({ message: _message, heroMessage: _heroMessage, ...anime }) => anime);
      try {
        await localforage.setItem(ANIME_CATALOG_CACHE_KEY, cache);
      } catch (cacheError: unknown) {
        console.error('No se pudo guardar la caché del catálogo de anime.', cacheError);
      }
    } catch (loadError) {
      if (isCancelled()) return;
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setIsLoading(false);
    }
  }, [client, isTelegramLoading]);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: number | undefined;
    let isRefreshing = false;

    const refresh = async () => {
      if (isRefreshing) return;
      isRefreshing = true;
      await loadAnimes(() => cancelled);
      isRefreshing = false;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    void localforage.getItem<CachedAnimeData[]>(ANIME_CATALOG_CACHE_KEY)
      .then((cached) => {
        if (cancelled || !Array.isArray(cached)) return;
        const validCache = cached.filter((anime) =>
          typeof anime.id === 'string' &&
          typeof anime.messageId === 'number' &&
          typeof anime.heroMessageId === 'number' &&
          typeof anime.title === 'string',
        );
        if (validCache.length > 0) setAnimes(validCache);
      })
      .catch((cacheError: unknown) => {
        console.error('No se pudo leer la caché del catálogo de anime.', cacheError);
      })
      .finally(() => {
        if (cancelled) return;
        if (!client && !isTelegramLoading) {
          setIsLoading(false);
          setError('No hay una sesión de Telegram activa. Vuelve a iniciar sesión.');
          return;
        }
        void refresh();
        refreshTimer = window.setInterval(() => void refresh(), REVALIDATE_INTERVAL_MS);
        window.addEventListener('focus', onVisibilityChange);
        document.addEventListener('visibilitychange', onVisibilityChange);
      });

    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
      window.removeEventListener('focus', onVisibilityChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [client, isTelegramLoading, loadAnimes]);

  return { animes, isLoading: isLoading && animes.length === 0, error };
}
