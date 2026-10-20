'use client';

import { useEffect, useState } from 'react';
import localforage from 'localforage';
import { Api } from 'telegram/tl';
import type { TelegramClient } from 'telegram/client/TelegramClient';
import type { TelegramAnimeMessage } from '@/hooks/anime';

type EpisodeThumbnailProps = {
  client: TelegramClient | null;
  message: TelegramAnimeMessage;
  label: string;
  className?: string;
};

const pendingDownloads = new Map<string, Promise<Blob | null>>();

function getDocument(message: TelegramAnimeMessage) {
  const media = message.media;
  return media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document
    ? media.document
    : null;
}

export default function EpisodeThumbnail({ client, message, label, className }: EpisodeThumbnailProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const document = getDocument(message);

    if (!client || !document) {
      setFailed(true);
      return;
    }

    const cacheKey = `episode_thumb_${document.id.toString()}`;
    setSrc(null);
    setFailed(false);

    const loadThumbnail = async () => {
      const cached = await localforage.getItem<Blob>(cacheKey);
      if (cached) return cached;

      let download = pendingDownloads.get(cacheKey);
      if (!download) {
        download = (async () => {
          const availableThumbs = (document.thumbs ?? []).filter(
            (thumb) =>
              thumb instanceof Api.PhotoSize ||
              thumb instanceof Api.PhotoSizeProgressive ||
              thumb instanceof Api.PhotoCachedSize,
          );
          if (availableThumbs.length === 0) return null;
          const thumbnail = availableThumbs.reduce((largest, current) => {
            const dimensions = (thumb: Api.TypePhotoSize) =>
              thumb instanceof Api.PhotoSize ||
              thumb instanceof Api.PhotoSizeProgressive ||
              thumb instanceof Api.PhotoCachedSize
                ? thumb.w * thumb.h
                : -1;
            return dimensions(current) > dimensions(largest) ? current : largest;
          });
          const bytes = await client.downloadMedia(message, { thumb: thumbnail });
          if (!bytes || typeof bytes === 'string' || bytes.length === 0) return null;
          const blob = new Blob([Uint8Array.from(bytes)], { type: 'image/jpeg' });
          await localforage.setItem(cacheKey, blob);
          return blob;
        })();
        pendingDownloads.set(cacheKey, download);
      }

      try {
        return await download;
      } finally {
        if (pendingDownloads.get(cacheKey) === download) pendingDownloads.delete(cacheKey);
      }
    };

    void loadThumbnail()
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setFailed(true);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(`No se pudo cargar la miniatura de ${label}.`, error);
        setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, label, message]);

  return (
    <div className={className ?? 'relative aspect-video w-full overflow-hidden rounded-md bg-gray-800'}>
      {!src && !failed && <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-gray-800" />}
      {src ? (
        <img src={src} alt={`Miniatura de ${label}`} className="h-full w-full object-cover" />
      ) : failed ? (
        <div aria-label={`Miniatura no disponible para ${label}`} className="h-full w-full bg-gray-800" />
      ) : null}
    </div>
  );
}
