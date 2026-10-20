'use client';

import { useCallback, useEffect, useState } from 'react';
import { Api } from 'telegram/tl';
import { useTelegram } from '@/context/TelegramContext';
import type { AnimeData, TelegramAnimeMessage } from '@/hooks/anime';
import { getTelegramMessageText } from '@/hooks/telegramMessageText';

const GROUP_NAME = 'AnimeKT1';
const TOPIC_ID = 16;

type ParsedAnimeData = Omit<AnimeData, 'id' | 'message' | 'heroMessage'>;

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

  const loadAnimes = useCallback(async (signal: AbortSignal) => {
    if (!client) {
      setAnimes([]);
      setError(isTelegramLoading ? null : 'No hay una sesión de Telegram activa. Vuelve a iniciar sesión.');
      setIsLoading(isTelegramLoading);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await client.connect();
      const messages = await client.getMessages(GROUP_NAME, {
        replyTo: TOPIC_ID,
        limit: 500,
      });
      if (signal.aborted) return;
      setAnimes(parseAnimeMessages(messages));
    } catch (loadError) {
      if (signal.aborted) return;
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setAnimes([]);
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, [client, isTelegramLoading]);

  useEffect(() => {
    const controller = new AbortController();
    void loadAnimes(controller.signal);
    return () => controller.abort();
  }, [loadAnimes]);

  return { animes, isLoading, error };
}
