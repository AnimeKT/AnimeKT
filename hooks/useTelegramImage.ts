'use client';

import { useEffect, useState } from 'react';
import localforage from 'localforage';
import { useTelegram } from '@/context/TelegramContext';
import type { TelegramAnimeMessage } from '@/hooks/anime';

type TelegramImageState = {
  imageUrl: string | null;
  isLoading: boolean;
  error: string | null;
};

const pendingImages = new Map<string, Promise<Blob>>();

export function useTelegramImage(message?: TelegramAnimeMessage): TelegramImageState {
  const { client } = useTelegram();
  const [state, setState] = useState<TelegramImageState>({
    imageUrl: null,
    isLoading: Boolean(message),
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (!message || !client) {
      setState({
        imageUrl: null,
        isLoading: false,
        error: message ? 'No hay una sesión de Telegram activa.' : null,
      });
      return;
    }

    const key = `catalog_img_${message.id}`;
    setState({ imageUrl: null, isLoading: true, error: null });

    const loadImage = async () => {
      const cachedBlob = await localforage.getItem<Blob>(key);
      if (cachedBlob) return cachedBlob;

      let pendingDownload = pendingImages.get(key);
      if (!pendingDownload) {
        pendingDownload = (async () => {
          const media = await client.downloadMedia(message);
          if (!media || typeof media === 'string') {
            throw new Error(`Telegram no devolvió una imagen válida para el mensaje ${message.id}.`);
          }

          const blob = new Blob([Uint8Array.from(media)], { type: 'image/jpeg' });
          await localforage.setItem(key, blob);
          return blob;
        })();
        pendingImages.set(key, pendingDownload);
      }

      try {
        return await pendingDownload;
      } finally {
        if (pendingImages.get(key) === pendingDownload) pendingImages.delete(key);
      }
    };

    void loadImage()
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ imageUrl: objectUrl, isLoading: false, error: null });
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setState({
          imageUrl: null,
          isLoading: false,
          error: loadError instanceof Error ? loadError.message : String(loadError),
        });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, message]);

  return state;
}
