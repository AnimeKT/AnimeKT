'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Api } from 'telegram/tl';
import { getTelegramMessageText } from '@/hooks/telegramMessageText';
import type { TelegramAnimeMessage } from '@/hooks/anime';
import { useTelegramImage } from '@/hooks/useTelegramImage';
import { useTelegram } from '@/context/TelegramContext';

const ALBUM_GROUP = 'Kaergsty';
const ALBUM_TOPIC_ID = 2342;
const PAGE_SIZE = 50;
const GRID_ROW_HEIGHT = 4;
const GRID_GAP = 16;

function getMediaType(message: TelegramAnimeMessage): 'image' | 'video' | null {
  const media = message.media;
  if (media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo) return 'image';
  if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    if (media.document.mimeType.startsWith('video/') ||
      media.document.attributes.some((attribute) => attribute instanceof Api.DocumentAttributeVideo)) {
      return 'video';
    }
    if (media.document.mimeType.startsWith('image/')) return 'image';
  }
  return null;
}

function getMediaDimensions(message: TelegramAnimeMessage) {
  const media = message.media;
  if (media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo) {
    const sizes = media.photo.sizes.filter(
      (size): size is Api.PhotoSize | Api.PhotoSizeProgressive | Api.PhotoCachedSize =>
        size instanceof Api.PhotoSize ||
        size instanceof Api.PhotoSizeProgressive ||
        size instanceof Api.PhotoCachedSize,
    );
    const largest = sizes.reduce<Api.PhotoSize | Api.PhotoSizeProgressive | Api.PhotoCachedSize | null>(
      (result, size) => !result || size.w * size.h > result.w * result.h ? size : result,
      null,
    );
    if (largest) return { width: largest.w, height: largest.h };
  }

  if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    const video = media.document.attributes.find(
      (attribute) => attribute instanceof Api.DocumentAttributeVideo,
    );
    if (video instanceof Api.DocumentAttributeVideo && video.w > 0 && video.h > 0) {
      return { width: video.w, height: video.h };
    }

    const thumbnail = media.document.thumbs?.find(
      (size) => size instanceof Api.PhotoSize || size instanceof Api.PhotoSizeProgressive,
    );
    if (
      (thumbnail instanceof Api.PhotoSize || thumbnail instanceof Api.PhotoSizeProgressive) &&
      thumbnail.w > 0 &&
      thumbnail.h > 0
    ) {
      return { width: thumbnail.w, height: thumbnail.h };
    }
  }

  return { width: 3, height: 4 };
}

function useNearViewport() {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || isNearViewport) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '250px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [isNearViewport]);

  return { elementRef, isNearViewport };
}

function useGridRowSpan(
  elementRef: React.RefObject<HTMLDivElement | null>,
  message: TelegramAnimeMessage,
) {
  const [rowSpan, setRowSpan] = useState(12);
  const { width: mediaWidth, height: mediaHeight } = getMediaDimensions(message);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const updateRowSpan = () => {
      const cardWidth = element.getBoundingClientRect().width;
      if (cardWidth <= 0) return;
      const mediaHeightAtCardWidth = cardWidth * mediaHeight / mediaWidth;
      const span = Math.ceil(
        (mediaHeightAtCardWidth + GRID_GAP) / (GRID_ROW_HEIGHT + GRID_GAP),
      );
      setRowSpan(Math.max(1, span));
    };

    updateRowSpan();
    const observer = new ResizeObserver(updateRowSpan);
    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef, mediaHeight, mediaWidth]);

  return rowSpan;
}

function AlbumCard({
  message,
  onSelect,
}: {
  message: TelegramAnimeMessage;
  onSelect: (message: TelegramAnimeMessage) => void;
}) {
  const { elementRef, isNearViewport } = useNearViewport();
  const rowSpan = useGridRowSpan(elementRef, message);
  const { imageUrl, isLoading } = useTelegramImage(
    isNearViewport ? message : undefined,
    undefined,
    { thumbnail: true },
  );
  const type = getMediaType(message);

  return (
    <div ref={elementRef} className="min-w-0" style={{ gridRowEnd: `span ${rowSpan}` }}>
      <button
        type="button"
        onClick={() => onSelect(message)}
        aria-label={`Abrir ${type === 'video' ? 'video' : 'imagen'} del mensaje ${message.id}`}
        className="group relative block h-full w-full overflow-hidden rounded-xl border border-white/10 bg-[#171923] shadow-lg shadow-black/20 transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" className="block h-full w-full object-cover" />
        ) : (
          <div aria-hidden="true" className={`h-full w-full ${isLoading ? 'animate-pulse bg-[#202330]' : 'bg-[#252837]'}`} />
        )}
      </button>
    </div>
  );
}

function AlbumLightbox({
  message,
  onClose,
}: {
  message: TelegramAnimeMessage;
  onClose: () => void;
}) {
  const { imageUrl, isLoading, error } = useTelegramImage(message);
  const caption = getTelegramMessageText(message).trim();
  const type = getMediaType(message);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={caption || 'Vista del álbum'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#11131b] shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-gray-200">{caption || 'Álbum de Telegram'}</p>
            <p className="mt-1 text-xs text-gray-500">
              Mensaje {message.id} · {type === 'video' ? 'Vídeo' : 'Imagen'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/15 text-xl text-white hover:bg-white/10"
          >
            ×
          </button>
        </div>
        <div className="flex min-h-64 flex-1 items-center justify-center overflow-auto p-3">
          {error ? (
            <p role="alert" className="text-sm text-red-300">No se pudo cargar el archivo de Telegram.</p>
          ) : isLoading || !imageUrl ? (
            <p className="text-sm text-gray-400">Cargando archivo original...</p>
          ) : type === 'video' ? (
            <video src={imageUrl} controls autoPlay muted loop className="max-h-[75vh] max-w-full" />
          ) : (
            <img
              src={imageUrl}
              alt={caption || 'Imagen del álbum en alta resolución'}
              className="max-h-[75vh] max-w-full object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function AlbumPage() {
  const { client, isAuthenticated, isLoading: isTelegramLoading } = useTelegram();
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const offsetIdRef = useRef<number | null>(null);
  const hasMoreRef = useRef(true);
  const [messages, setMessages] = useState<TelegramAnimeMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<TelegramAnimeMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const closeLightbox = useCallback(() => setSelectedMessage(null), []);

  const loadMore = useCallback(async () => {
    if (!client || !isAuthenticated || loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      await client.connect();
      const params = {
        replyTo: ALBUM_TOPIC_ID,
        limit: PAGE_SIZE,
        ...(offsetIdRef.current !== null ? { offsetId: offsetIdRef.current } : {}),
      };
      const threadMessages = await client.getMessages(ALBUM_GROUP, params);
      const pageMessages = threadMessages.filter((message) => getMediaType(message));
      const lastMessage = threadMessages[threadMessages.length - 1];
      offsetIdRef.current = lastMessage?.id ?? null;
      const canLoadMore = threadMessages.length === PAGE_SIZE && offsetIdRef.current !== null;
      hasMoreRef.current = canLoadMore;
      setHasMore(canLoadMore);

      if (pageMessages.length > 0) {
        setMessages((currentMessages) => {
          const uniqueMessages = new Map(currentMessages.map((message) => [message.id, message]));
          for (const message of pageMessages) uniqueMessages.set(message.id, message);
          return [...uniqueMessages.values()].sort((first, second) => second.id - first.id);
        });
      }
    } catch (loadError: unknown) {
      console.error('No se pudieron cargar más elementos del álbum de Telegram.', loadError);
      setLoadMoreError('No se pudieron cargar más elementos. Inténtalo de nuevo.');
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [client, isAuthenticated]);

  useEffect(() => {
    if (isTelegramLoading) return;
    if (!client || !isAuthenticated) {
      setIsLoading(false);
      setError('Conecta tu sesión MTProto de Telegram para cargar el álbum.');
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setIsLoadingMore(false);
    setMessages([]);
    setError(null);
    setLoadMoreError(null);
    loadingMoreRef.current = true;
    offsetIdRef.current = null;
    hasMoreRef.current = true;
    setHasMore(true);
    void (async () => {
      try {
        await client.connect();
        const threadMessages = await client.getMessages(ALBUM_GROUP, {
          replyTo: ALBUM_TOPIC_ID,
          limit: PAGE_SIZE,
        });
        const pageMessages = threadMessages.filter((message) => getMediaType(message));
        const lastMessage = threadMessages[threadMessages.length - 1];
        offsetIdRef.current = lastMessage?.id ?? null;
        const canLoadMore = threadMessages.length === PAGE_SIZE && offsetIdRef.current !== null;
        hasMoreRef.current = canLoadMore;

        if (!cancelled) {
          setMessages([...pageMessages].sort((first, second) => second.id - first.id));
          setHasMore(canLoadMore);
        }
      } catch (loadError: unknown) {
        console.error('No se pudo cargar el álbum del tema de Telegram 2342.', loadError);
        if (!cancelled) {
          setError(loadError instanceof Error
            ? `No se pudo cargar el álbum de Telegram: ${loadError.message}`
            : 'No se pudo cargar el álbum de Telegram.');
        }
      } finally {
        if (!cancelled) loadingMoreRef.current = false;
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, isAuthenticated, isTelegramLoading]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || isLoading || !hasMore || error || loadMoreError) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      { rootMargin: '700px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [error, hasMore, isLoading, loadMore, loadMoreError]);

  return (
    <main className="w-full min-h-screen px-4 pb-16 pt-6 sm:pt-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-light">Galería</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Álbum</h1>
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {isLoading ? (
        <div
          aria-label="Cargando álbum"
          aria-busy="true"
          className="grid w-full grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] auto-rows-[4px] gap-4 px-4"
        >
          {Array.from({ length: 8 }, (_, index) => (
            <div
              key={index}
              className="min-h-48 animate-pulse rounded-xl bg-white/10"
              style={{ gridRowEnd: 'span 11' }}
            />
          ))}
        </div>
      ) : !error && messages.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-8 text-center text-sm text-gray-400">
          No hay fotos ni vídeos en el tema de Telegram 2342.
        </p>
      ) : (
        <div
          className="grid w-full grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] auto-rows-[4px] gap-4 px-4"
        >
          {messages.map((message) => (
            <AlbumCard key={message.id} message={message} onSelect={setSelectedMessage} />
          ))}
        </div>
      )}

      {!isLoading && messages.length > 0 && hasMore && (
        <div ref={loadMoreSentinelRef} className="flex min-h-20 items-center justify-center py-6">
          {isLoadingMore && <p className="text-sm text-gray-400">Cargando más elementos...</p>}
          {loadMoreError && (
            <button
              type="button"
              onClick={() => void loadMore()}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-200 hover:bg-white/10"
            >
              {loadMoreError}
            </button>
          )}
        </div>
      )}

      {selectedMessage && <AlbumLightbox message={selectedMessage} onClose={closeLightbox} />}
    </main>
  );
}
