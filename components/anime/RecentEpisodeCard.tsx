'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import localforage from 'localforage';
import { Api } from 'telegram/tl';
import type { RecentEpisode } from '@/hooks/useRecentEpisodes';
import { useTelegram } from '@/context/TelegramContext';

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

type CachedRecentMedia = {
  buffer: Uint8Array;
  timestamp: number;
  mediaVersion?: string;
  mimeType?: string;
};

function getMediaVersion(media: Api.TypeMessageMedia | undefined) {
  if (media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo) {
    return media.photo.id.toString();
  }
  if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    return media.document.id.toString();
  }
  return '';
}

type RecentEpisodeCardProps = {
  episode: RecentEpisode;
  isLat: boolean;
};

export default function RecentEpisodeCard({ episode, isLat }: RecentEpisodeCardProps) {
  const { client } = useTelegram();
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const media = episode.message?.media;
    const document = media instanceof Api.MessageMediaDocument &&
      media.document instanceof Api.Document
      ? media.document
      : null;

    setMediaUrl(null);
    setMediaType('');
    const loadMedia = async () => {
      let mediaBuffer: Uint8Array | Buffer | string | undefined;
      const cacheKey = `recent_media_${episode.messageId}`;
      const mediaVersion = getMediaVersion(media);
      const hasSupportedMedia = media instanceof Api.MessageMediaPhoto ||
        media instanceof Api.MessageMediaDocument;
      let cachedData: CachedRecentMedia | null = null;
      try {
        cachedData = await localforage.getItem<CachedRecentMedia>(cacheKey);
      } catch (cacheError: unknown) {
        console.error(`No se pudo leer la caché del media de ${episode.title}.`, cacheError);
      }

      const cacheIsFresh = cachedData?.buffer &&
        (!episode.message || (
          cachedData.mediaVersion === mediaVersion &&
          Date.now() - cachedData.timestamp < THREE_MONTHS_MS
        ));
      if (cacheIsFresh && cachedData?.buffer) {
        mediaBuffer = cachedData.buffer;
      } else if (client && episode.message && hasSupportedMedia) {
        const downloadedMedia = await client.downloadMedia(episode.message);
        if (downloadedMedia && typeof downloadedMedia !== 'string') {
          mediaBuffer = Uint8Array.from(downloadedMedia);
          try {
            await localforage.setItem<CachedRecentMedia>(cacheKey, {
              buffer: mediaBuffer,
              timestamp: Date.now(),
              mediaVersion,
              mimeType: document?.mimeType || 'image/jpeg',
            });
          } catch (cacheError: unknown) {
            console.error(`No se pudo guardar en caché el media de ${episode.title}.`, cacheError);
          }
        }
      }

      if (cancelled || !mediaBuffer || typeof mediaBuffer === 'string' || mediaBuffer.length === 0) {
        return;
      }

      const mimeType = document?.mimeType || cachedData?.mimeType || 'image/jpeg';
      const blobBuffer = new ArrayBuffer(mediaBuffer.byteLength);
      new Uint8Array(blobBuffer).set(mediaBuffer);
      const blob = new Blob([blobBuffer], { type: mimeType });
      objectUrl = URL.createObjectURL(blob);
      setMediaType(mimeType);
      setMediaUrl(objectUrl);
    };

    void loadMedia()
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error(`No se pudo cargar la animación de ${episode.title}.`, error);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, episode.message, episode.messageId, episode.title]);

  const episodeHref = episode.anime.id === 'notification'
    ? `/ver/notification?fileId=${episode.fileId}&title=${encodeURIComponent(episode.title)}`
    : `/ver/${encodeURIComponent(episode.anime.id)}?fileId=${episode.fileId}`;

  return (
    <Link
      href={episodeHref}
      className="group flex min-w-0 flex-col gap-2"
      aria-label={`${episode.title}, ${episode.label}, ${episode.relativeTime}`}
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-[#1a1c23]">
        {mediaUrl && mediaType.startsWith('video/') ? (
          <video
            src={mediaUrl}
            autoPlay
            loop
            muted
            playsInline
            aria-label={`Animación de ${episode.title}`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : mediaUrl ? (
          <img
            src={mediaUrl}
            alt={`Imagen de ${episode.title}`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-gray-800" />
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <span className="absolute bottom-0 left-0 rounded-tr-xl bg-[#2b2d42] px-3 py-1.5 text-xs font-bold text-[#8b5cf6]">
          <span className="font-bold">{episode.label}</span>
          {isLat && (
            <span className="ml-2 rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              LAT
            </span>
          )}
        </span>
        <time className="absolute bottom-2 right-2 text-xs font-medium text-gray-300">
          {episode.relativeTime}
        </time>
      </div>
      <p className="truncate px-1 text-xs font-bold uppercase text-gray-300 transition-colors group-hover:text-purple-400">
        {episode.title}
      </p>
    </Link>
  );
}
