'use client';

import { useEffect, useState } from 'react';
import localforage from 'localforage';
import { Api } from 'telegram/tl';
import { useTelegram } from '@/context/TelegramContext';
import type { TelegramAnimeMessage } from '@/hooks/anime';

type TelegramImageState = {
  imageUrl: string | null;
  isLoading: boolean;
  error: string | null;
};

const pendingImages = new Map<string, Promise<Blob>>();

function getImageCacheKey(message: TelegramAnimeMessage) {
  const media = message.media;
  const mediaId = media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo
    ? media.photo.id.toString()
    : media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document
      ? media.document.id.toString()
      : 'unknown';
  return `catalog_img_${message.id}_${mediaId}`;
}

export function useTelegramImage(
  message?: TelegramAnimeMessage,
  messageId?: number,
): TelegramImageState {
  const { client } = useTelegram();
  const [state, setState] = useState<TelegramImageState>({
    imageUrl: null,
    isLoading: Boolean(message || messageId),
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const id = message?.id ?? messageId;

    if (!id) {
      setState({
        imageUrl: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    const cacheKey = message ? getImageCacheKey(message) : null;
    setState((current) => ({ ...current, isLoading: true, error: null }));

    const loadImage = async () => {
      const legacyKey = `catalog_img_${id}`;
      const cachedBlob = cacheKey
        ? await localforage.getItem<Blob>(cacheKey) ??
          await localforage.getItem<Blob>(legacyKey)
        : await localforage.getItem<Blob>(legacyKey);

      if (cachedBlob) {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(cachedBlob);
        setState({ imageUrl: objectUrl, isLoading: Boolean(message && !client), error: null });
        if (!message || !client) return;
      }

      if (!message || !client) {
        setState((current) => ({ ...current, isLoading: false }));
        return;
      }

      let pendingDownload = pendingImages.get(cacheKey!);
      if (!pendingDownload) {
        pendingDownload = (async () => {
          const media = await client.downloadMedia(message);
          if (!media || typeof media === 'string') {
            throw new Error(`Telegram no devolvió una imagen válida para el mensaje ${message.id}.`);
          }

          const blob = new Blob([Uint8Array.from(media)], { type: 'image/jpeg' });
          try {
            await localforage.setItem(cacheKey!, blob);
            await localforage.setItem(legacyKey, blob);
          } catch (cacheError: unknown) {
            console.error(`No se pudo actualizar la caché de la imagen ${message.id}.`, cacheError);
          }
          return blob;
        })();
        pendingImages.set(cacheKey!, pendingDownload);
      }

      try {
        const freshBlob = await pendingDownload;
        if (cachedBlob && freshBlob === cachedBlob) return;
        return freshBlob;
      } finally {
        if (pendingImages.get(cacheKey!) === pendingDownload) pendingImages.delete(cacheKey!);
      }
    };

    void loadImage()
      .then((blob) => {
        if (cancelled || !blob) return;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(blob);
        setState({ imageUrl: objectUrl, isLoading: false, error: null });
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setState((current) => ({
          imageUrl: current.imageUrl,
          isLoading: false,
          error: loadError instanceof Error ? loadError.message : String(loadError),
        }));
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, message, messageId]);

  return state;
}
