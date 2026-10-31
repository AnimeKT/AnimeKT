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
let imageDownloadQueue: Promise<void> = Promise.resolve();

function getCachedImageUrl(message?: TelegramAnimeMessage, messageId?: number, thumbnail = false) {
  const id = message?.id ?? messageId;
  if (!id) return null;
  const cacheKey = message ? getImageCacheKey(message, thumbnail) : null;
  const legacyKey = thumbnail ? `catalog_thumb_v2_${id}` : `catalog_img_${id}`;
  return (cacheKey ? imageUrlMemoryCache.get(cacheKey) : undefined) ??
    imageUrlMemoryCache.get(legacyKey) ??
    null;
}

function getImageCacheKey(message: TelegramAnimeMessage, thumbnail = false) {
  const media = message.media;
  const mediaId = media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo
    ? media.photo.id.toString()
    : media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document
      ? media.document.id.toString()
      : 'unknown';
  return `catalog_img_${message.id}_${mediaId}${thumbnail ? '_thumb_v2' : ''}`;
}

function getMediaMimeType(message: TelegramAnimeMessage, isThumbnail = false) {
  if (isThumbnail) return 'image/jpeg';
  const media = message.media;
  return media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document
    ? media.document.mimeType
    : 'image/jpeg';
}

function getThumbnail(message: TelegramAnimeMessage): Api.TypePhotoSize | undefined {
  const media = message.media;
  const sizes = media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo
    ? media.photo.sizes
    : media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document
      ? media.document.thumbs ?? []
      : [];
  return sizes
    .filter((size): size is Api.PhotoSize | Api.PhotoSizeProgressive | Api.PhotoCachedSize | Api.PhotoStrippedSize =>
      size instanceof Api.PhotoSize ||
      size instanceof Api.PhotoSizeProgressive ||
      size instanceof Api.PhotoCachedSize ||
      size instanceof Api.PhotoStrippedSize)
    .reduce<Api.TypePhotoSize | undefined>((smallest, current) => {
      if (!smallest) return current;
      const area = (size: Api.TypePhotoSize) =>
        size instanceof Api.PhotoSize ||
        size instanceof Api.PhotoSizeProgressive ||
        size instanceof Api.PhotoCachedSize
          ? size.w * size.h
          : Number.MAX_SAFE_INTEGER;
      return area(current) < area(smallest) ? current : smallest;
    }, undefined);
}

export function useTelegramImage(
  message?: TelegramAnimeMessage,
  messageId?: number,
  options: { thumbnail?: boolean } = {},
): TelegramImageState {
  const { client } = useTelegram();
  const isThumbnail = options.thumbnail ?? false;
  const [state, setState] = useState<TelegramImageState>(() => {
    const cachedImageUrl = getCachedImageUrl(message, messageId, isThumbnail);
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

    const cacheKey = message ? getImageCacheKey(message, isThumbnail) : null;
    const legacyKey = isThumbnail ? `catalog_thumb_v2_${id}` : `catalog_img_${id}`;
    const memoryImageUrl = getCachedImageUrl(message, id, isThumbnail);
    const hasVersionedMemoryImage = Boolean(cacheKey && imageUrlMemoryCache.has(cacheKey));
    if (memoryImageUrl) {
      setState({ imageUrl: memoryImageUrl, isLoading: false, error: null });
    } else {
      setState((current) => ({ ...current, isLoading: true, error: null }));
    }

    const cacheBlobInMemory = (blob: Blob) => {
      const cachedUrl = cacheKey
        ? imageUrlMemoryCache.get(cacheKey)
        : imageUrlMemoryCache.get(legacyKey);
      if (cachedUrl) {
        if (!cancelled) setState({ imageUrl: cachedUrl, isLoading: false, error: null });
        return cachedUrl;
      }

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
        const queuedDownload = imageDownloadQueue.then(async () => {
          const thumbnail = isThumbnail ? getThumbnail(message) : undefined;
          if (isThumbnail && !thumbnail) {
            throw new Error(`Telegram no devolvió miniatura para el mensaje ${message.id}.`);
          }
          const media = await client.downloadMedia(
            message,
            thumbnail ? { thumb: thumbnail } : undefined,
          );
          if (!media || typeof media === 'string') {
            throw new Error(`Telegram no devolvió un medio válido para el mensaje ${message.id}.`);
          }
          return new Blob([Uint8Array.from(media)], {
            type: getMediaMimeType(message, Boolean(thumbnail)),
          });
        });
        imageDownloadQueue = queuedDownload.then(() => undefined, () => undefined);
        pendingDownload = queuedDownload.then(async (blob) => {
          try {
            await localforage.setItem(cacheKey!, blob);
            await localforage.setItem(legacyKey, blob);
          } catch (cacheError: unknown) {
            console.error(`No se pudo actualizar la caché de la imagen ${message.id}.`, cacheError);
          }
          return blob;
        });
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
  }, [client, isThumbnail, message, messageId]);

  return state;
}
