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
const imageUrlMemoryCache = new Map<string, string>();

function getCachedImageUrl(message?: TelegramAnimeMessage, messageId?: number) {
  const id = message?.id ?? messageId;
  if (!id) return null;
  const cacheKey = message ? getImageCacheKey(message) : null;
  return (cacheKey ? imageUrlMemoryCache.get(cacheKey) : undefined) ??
    imageUrlMemoryCache.get(`catalog_img_${id}`) ??
    null;
}

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
  const [state, setState] = useState<TelegramImageState>(() => {
    const cachedImageUrl = getCachedImageUrl(message, messageId);
    return {
      imageUrl: cachedImageUrl,
      isLoading: Boolean((message || messageId) && !cachedImageUrl),
      error: null,
    };
  });

  useEffect(() => {
    let cancelled = false;
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
    const legacyKey = `catalog_img_${id}`;
    const memoryImageUrl = getCachedImageUrl(message, id);
    const hasVersionedMemoryImage = Boolean(cacheKey && imageUrlMemoryCache.has(cacheKey));
    if (memoryImageUrl) {
      setState({ imageUrl: memoryImageUrl, isLoading: false, error: null });
    } else {
      setState((current) => ({ ...current, isLoading: true, error: null }));
    }

    const cacheBlobInMemory = (blob: Blob) => {
      const imageUrl = URL.createObjectURL(blob);
      if (cacheKey) imageUrlMemoryCache.set(cacheKey, imageUrl);
      imageUrlMemoryCache.set(legacyKey, imageUrl);
      if (!cancelled) {
        setState({ imageUrl, isLoading: false, error: null });
      }
      return imageUrl;
    };

    const loadImage = async () => {
      if (hasVersionedMemoryImage) return;
      let cachedBlob: Blob | null = null;
      let hasVersionedCachedBlob = false;
      if (!memoryImageUrl) {
        if (cacheKey) {
          cachedBlob = await localforage.getItem<Blob>(cacheKey);
          hasVersionedCachedBlob = cachedBlob !== null;
        }
        if (!cachedBlob) cachedBlob = await localforage.getItem<Blob>(legacyKey);
      }

      if (cachedBlob) {
        if (cancelled) return;
        cacheBlobInMemory(cachedBlob);
        if (!message || !client || hasVersionedCachedBlob) return;
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
        return await pendingDownload;
      } finally {
        if (pendingImages.get(cacheKey!) === pendingDownload) pendingImages.delete(cacheKey!);
      }
    };

    void loadImage()
      .then((blob) => {
        if (cancelled || !blob) return;
        cacheBlobInMemory(blob);
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
    };
  }, [client, message, messageId]);

  return state;
}
