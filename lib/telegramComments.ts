import bigInt from 'big-integer';
import { Buffer } from 'buffer';
import localforage from 'localforage';
import { utils } from 'telegram';
import type { TelegramClient } from 'telegram/client/TelegramClient';
import { CustomFile } from 'telegram/client/uploads';
import { Api } from 'telegram/tl';
import { messageHasCommentThreadHashtag } from '@/lib/commentThread';

export type TelegramComment = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  groupedId?: string;
  messageIds: string[];
  text: string;
  mediaUrls: string[];
  contentGroupId?: string;
  replyToMessageId?: string;
  contentBlocks?: TelegramCommentContentBlock[];
  likes: number;
  dislikes: number;
  userReaction?: 'like' | 'dislike' | null;
  replies: TelegramComment[];
  time: string;
  timestamp?: number;
  color: string;
};

export type TelegramCommentContentBlock =
  | { kind: 'text'; text: string; messageId: string; index: number }
  | { kind: 'image'; mediaUrl: string; messageId: string; isSpoiler: boolean; index: number };

export type TelegramCommentDraftBlock =
  | { kind: 'text'; text: string; messageId?: string; originalText?: string; originalIndex?: number }
  | {
    kind: 'image';
    file?: File;
    mediaUrl?: string;
    messageId?: string;
    isSpoiler: boolean;
    originalIsSpoiler?: boolean;
    originalIndex?: number;
  };

export type TelegramCommentsPage = {
  comments: TelegramComment[];
  hasMore: boolean;
  nextOffsetId: number | null;
};

export type RecentCommentActivity = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  text: string;
  hasImage: boolean;
  timestamp: number;
  animeId: string;
  animeTitle: string;
  episodeId: string | null;
  episodeLabel: string | null;
  episodeTopicId: string | null;
  episodeLanguage: 'Sub' | 'Dub' | null;
  likes: number;
  dislikes: number;
};

export type RecentCommentAnimeInfo = {
  title: string;
  topicsSub: number[];
  topicsDub: number[];
};

function getEpisodeNumberFromMessage(message: Api.Message, fallbackNumber: number) {
  const text = message.message.normalize('NFKC');
  const match = text.match(/C\s*A\s*P\s*-\s*(\d+(?:\.\d+)?)/i) ??
    text.match(/EPISODIO N[°o]\s*(\d+(?:\.\d+)?)/i) ??
    text.match(/\[(\d+(?:\.\d+)?)\]/) ??
    text.match(/\b(?:episodio|ep\.?)\s*(\d+(?:\.\d+)?)/i);
  return match?.[1] ?? String(fallbackNumber);
}

function isEpisodeVideoMessage(message: Api.Message) {
  const media = message.media;
  if (!(media instanceof Api.MessageMediaDocument) || !(media.document instanceof Api.Document)) {
    return false;
  }
  return media.document.mimeType.startsWith('video/') ||
    media.document.attributes.some((attribute) => attribute instanceof Api.DocumentAttributeVideo);
}

const avatarMemoryCache = new Map<string, string>();
const avatarRequestCache = new Map<string, Promise<string | null>>();
const avatarCachePrefix = 'telegram_avatar_blob_v1:';
const AVATAR_MEMORY_CACHE_LIMIT = 200;

function cacheAvatarUrl(userId: string, url: string) {
  const previousUrl = avatarMemoryCache.get(userId);
  if (previousUrl && previousUrl !== url) URL.revokeObjectURL(previousUrl);
  avatarMemoryCache.delete(userId);
  avatarMemoryCache.set(userId, url);

  if (avatarMemoryCache.size > AVATAR_MEMORY_CACHE_LIMIT) {
    const oldestKey = avatarMemoryCache.keys().next();
    if (!oldestKey.done) {
      const oldestUrl = avatarMemoryCache.get(oldestKey.value);
      avatarMemoryCache.delete(oldestKey.value);
      if (oldestUrl) URL.revokeObjectURL(oldestUrl);
    }
  }
}

const markerPrefix = '\u2063\u200D';
const markerSuffix = '\u2063';
const markerBitZero = '\u200B';
const markerBitOne = '\u200C';
const markerPattern = /\u2063\u200D([\u200B\u200C]+)\u2063$/;

function encodeCommentBlockMarker(groupId: string, index: number): string {
  const value = `${groupId}:${index}`;
  const bytes = new TextEncoder().encode(value);
  let bits = '';
  bytes.forEach((byte) => {
    for (let bit = 7; bit >= 0; bit -= 1) {
      bits += (byte & (1 << bit)) === 0 ? markerBitZero : markerBitOne;
    }
  });
  return `${markerPrefix}${bits}${markerSuffix}`;
}

function createContentGroupId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stripCommentBlockMarker(text: string): {
  text: string;
  groupId?: string;
  index?: number;
} {
  const match = markerPattern.exec(text);
  if (!match) return { text };
  const bits = match[1];
  if (bits.length % 8 !== 0) return { text };
  const bytes = new Uint8Array(bits.length / 8);
  for (let offset = 0; offset < bits.length; offset += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      if (bits[offset + bit] === markerBitOne) byte |= 1 << (7 - bit);
    }
    bytes[offset / 8] = byte;
  }
  const decoded = new TextDecoder().decode(bytes);
  const separator = decoded.lastIndexOf(':');
  const index = Number(decoded.slice(separator + 1));
  if (separator < 1 || !Number.isSafeInteger(index) || index < 0) return { text };
  return { text: text.slice(0, match.index), groupId: decoded.slice(0, separator), index };
}

export async function getProfilePic(
  client: TelegramClient,
  userId: string,
): Promise<string | null> {
  const cachedUrl = avatarMemoryCache.get(userId);
  if (cachedUrl) {
    avatarMemoryCache.delete(userId);
    avatarMemoryCache.set(userId, cachedUrl);
    return cachedUrl;
  }
  const existingRequest = avatarRequestCache.get(userId);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const cacheKey = `${avatarCachePrefix}${userId}`;
    try {
      const cachedBlob = await localforage.getItem<Blob>(cacheKey);
      if (cachedBlob instanceof Blob && cachedBlob.size > 0) {
        const objectUrl = URL.createObjectURL(cachedBlob);
        cacheAvatarUrl(userId, objectUrl);
        return objectUrl;
      }
    } catch (cacheError: unknown) {
      console.error(`No se pudo leer la caché del avatar ${userId}.`, cacheError);
    }

    const freshUrl = await downloadProfilePic(client, userId);
    if (!freshUrl) return null;
    cacheAvatarUrl(userId, freshUrl);
    try {
      const response = await fetch(freshUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await localforage.setItem(cacheKey, await response.blob());
    } catch (cacheError: unknown) {
      console.error(`No se pudo guardar la caché del avatar ${userId}.`, cacheError);
    }
    return freshUrl;
  })();
  avatarRequestCache.set(userId, request);
  try {
    return await request;
  } finally {
    avatarRequestCache.delete(userId);
  }
}

export function getCachedProfilePicUrl(userId: string): string | null {
  const cachedUrl = avatarMemoryCache.get(userId);
  if (!cachedUrl) return null;
  avatarMemoryCache.delete(userId);
  avatarMemoryCache.set(userId, cachedUrl);
  return cachedUrl;
}

async function downloadProfilePic(
  client: TelegramClient,
  userId: string,
): Promise<string | null> {
  const parsedUserId = utils.parseID(userId);
  if (!parsedUserId) return null;

  const user = await client.getEntity(parsedUserId);
  if (!(user instanceof Api.User)) return null;

  const photo = await client.downloadProfilePhoto(user, { isBig: false });
  if (!photo || typeof photo === 'string' || photo.length === 0) return null;

  const blob = new Blob([Uint8Array.from(photo)], { type: 'image/jpeg' });
  return URL.createObjectURL(blob);
}

async function getCommentMediaUrl(
  client: TelegramClient,
  message: Api.Message,
  mimeType: string,
): Promise<string | null> {
  const downloadedMedia = await client.downloadMedia(message);
  if (!downloadedMedia || typeof downloadedMedia === 'string' || downloadedMedia.length === 0) {
    return null;
  }
  const blob = new Blob([Uint8Array.from(downloadedMedia)], { type: mimeType });
  return URL.createObjectURL(blob);
}

const avatarColors = [
  'from-fuchsia-500 to-violet-700',
  'from-cyan-500 to-blue-700',
  'from-amber-500 to-rose-700',
  'from-emerald-500 to-teal-700',
];

function cacheComments(threadId: number, comments: TelegramComment[]) {
  if (typeof window === 'undefined') return;
  try {
    const stripMediaUrls = (items: TelegramComment[]): TelegramComment[] => items.map((comment) => ({
      ...comment,
      mediaUrls: [],
      contentBlocks: undefined,
      replies: stripMediaUrls(comment.replies),
    }));
    localStorage.setItem(`comments_${threadId}`, JSON.stringify(stripMediaUrls(comments)));
  } catch (error) {
    console.error('No se pudieron guardar los comentarios en caché local.', error);
  }
}

async function getCommentsGroup(client: TelegramClient) {
  const groupId = process.env.NEXT_PUBLIC_TELEGRAM_GROUP_ID;
  if (!groupId) throw new Error('Falta configurar NEXT_PUBLIC_TELEGRAM_GROUP_ID.');

  const dialogs = await client.getDialogs();
  const groupDialog = dialogs.find(
    (dialog) => dialog.entity && utils.getPeerId(dialog.entity, true) === groupId,
  );
  if (!groupDialog?.entity) {
    throw new Error('No se encontró el grupo de comentarios en los diálogos de esta cuenta de Telegram.');
  }
  return groupDialog.entity;
}

function getReactionCount(message: Api.Message, emoji: '👍' | '👎') {
  const reactions = message.reactions;
  if (!(reactions instanceof Api.MessageReactions)) return 0;
  const result = reactions.results.find(
    (reaction) =>
      reaction instanceof Api.ReactionCount &&
      reaction.reaction instanceof Api.ReactionEmoji &&
      reaction.reaction.emoticon === emoji,
  );
  return result instanceof Api.ReactionCount ? result.count : 0;
}

function getUserReaction(message: Api.Message): TelegramComment['userReaction'] {
  const reactions = message.reactions;
  if (!(reactions instanceof Api.MessageReactions)) return null;

  const chosenReaction = reactions.results.find(
    (reaction) => reaction instanceof Api.ReactionCount && reaction.chosenOrder !== undefined,
  );
  if (chosenReaction instanceof Api.ReactionCount &&
    chosenReaction.reaction instanceof Api.ReactionEmoji) {
    if (chosenReaction.reaction.emoticon === '👍') return 'like';
    if (chosenReaction.reaction.emoticon === '👎') return 'dislike';
  }

  const ownReaction = reactions.recentReactions?.find(
    (reaction) => reaction instanceof Api.MessagePeerReaction && reaction.my,
  );
  if (!(ownReaction instanceof Api.MessagePeerReaction) ||
    !(ownReaction.reaction instanceof Api.ReactionEmoji)) return null;
  if (ownReaction.reaction.emoticon === '👍') return 'like';
  if (ownReaction.reaction.emoticon === '👎') return 'dislike';
  return null;
}

export async function sendTelegramReaction(
  client: TelegramClient,
  messageId: number,
  emoji: '👍' | '👎' | null,
): Promise<void> {
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    throw new Error('El identificador del comentario no es válido para enviar la reacción.');
  }
  if (!client.connected) await client.connect();
  const group = await getCommentsGroup(client);
  await client.invoke(new Api.messages.SendReaction({
    peer: group,
    msgId: messageId,
    reaction: emoji ? [new Api.ReactionEmoji({ emoticon: emoji })] : [],
  }));
}

export async function fetchRecentCommentActivity(
  client: TelegramClient,
  animesById: Map<string, RecentCommentAnimeInfo>,
  limit = 500,
): Promise<RecentCommentActivity[]> {
  if (!client.connected) await client.connect();
  const group = await getCommentsGroup(client);
  const messages = (await client.getMessages(group, { limit }))
    .filter((message): message is Api.Message => message instanceof Api.Message)
    .sort((first, second) => first.id - second.id);
  const threadByRoot = new Map<number, Omit<RecentCommentActivity, 'id' | 'userId' | 'username' | 'avatar' | 'text' | 'hasImage' | 'timestamp' | 'likes' | 'dislikes'>>();

  messages.forEach((message) => {
    if (message.replyToMsgId !== undefined) return;
    const match = message.message.match(/(?:^|\s)#anime_(\d+)(?:_ep_(\d+)|_general)(?=$|\s)/i);
    if (!match) return;
    const animeId = match[1];
    const anime = animesById.get(animeId);
    threadByRoot.set(message.id, {
      animeId,
      animeTitle: anime?.title ?? `Anime ${animeId}`,
      episodeId: match[2] ?? null,
      episodeLabel: null,
      episodeTopicId: null,
      episodeLanguage: null,
    });
  });

  const blocks = new Map<string, {
    activity: RecentCommentActivity;
    blockIndex: number;
    blockTexts: Array<{ index: number; text: string }>;
  }>();
  const threadByMessage = new Map<number, Omit<RecentCommentActivity, 'id' | 'userId' | 'username' | 'avatar' | 'text' | 'hasImage' | 'timestamp' | 'likes' | 'dislikes'>>();
  for (const message of messages) {
    const parentId = message.replyToMsgId;
    const thread = parentId === undefined ? undefined : threadByRoot.get(parentId) ?? threadByMessage.get(parentId);
    if (!thread) continue;
    threadByMessage.set(message.id, thread);

    const marker = stripCommentBlockMarker(message.message);
    const groupKey = marker.groupId
      ? `content:${marker.groupId}`
      : message.groupedId
        ? `media:${message.groupedId}`
        : `message:${message.id}`;
    const existing = blocks.get(groupKey);
    const hasImage = message.media instanceof Api.MessageMediaPhoto ||
      (message.media instanceof Api.MessageMediaDocument &&
        message.media.document instanceof Api.Document &&
        message.media.document.mimeType.startsWith('image/'));

    if (existing) {
      existing.activity.hasImage ||= hasImage;
      if (marker.index === 0) {
        existing.activity.id = String(message.id);
        existing.activity.timestamp = message.date * 1000;
        existing.activity.likes = getReactionCount(message, '👍');
        existing.activity.dislikes = getReactionCount(message, '👎');
      }
      if (marker.text.trim()) {
        existing.blockTexts.push({ index: marker.index ?? existing.blockIndex, text: marker.text.trim() });
      }
      continue;
    }

    const rawSenderId = message.senderId?.toString() ??
      (message.fromId instanceof Api.PeerUser
        ? message.fromId.userId.toString()
        : message.fromId instanceof Api.PeerChannel
          ? message.fromId.channelId.toString()
          : message.fromId instanceof Api.PeerChat
            ? message.fromId.chatId.toString()
            : 'unknown');
    let sender = message.sender;
    if (!sender && typeof message.getSender === 'function') {
      try {
        sender = await message.getSender();
      } catch (error) {
        console.warn(`No se pudo resolver el remitente del comentario ${message.id}.`, error);
      }
    }
    const username = sender instanceof Api.User
      ? sender.firstName || sender.username || 'Usuario'
      : sender instanceof Api.Chat || sender instanceof Api.Channel
        ? sender.title || 'Usuario'
        : 'Usuario';
    const avatarName = username === 'Usuario' ? rawSenderId : username;
    const avatar = avatarName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase() ?? '')
      .join('') || '?';
    const activity: RecentCommentActivity = {
      id: String(message.id),
      userId: rawSenderId,
      username,
      avatar,
      text: marker.text.trim(),
      hasImage,
      timestamp: message.date * 1000,
      likes: getReactionCount(message, '👍'),
      dislikes: getReactionCount(message, '👎'),
      ...thread,
    };
    blocks.set(groupKey, {
      activity,
      blockIndex: marker.index ?? 0,
      blockTexts: marker.text.trim() ? [{ index: marker.index ?? 0, text: marker.text.trim() }] : [],
    });
  }

  const activities = [...blocks.values()]
    .map(({ activity, blockTexts }) => ({
      ...activity,
      text: blockTexts
        .sort((first, second) => first.index - second.index)
        .map(({ text }) => text)
        .join('\n'),
    }))
    .sort((first, second) => second.timestamp - first.timestamp)
    .slice(0, 12);

  const episodeIds = [...new Set(
    activities.flatMap(({ episodeId }) => episodeId ? [Number(episodeId)] : []),
  )].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (episodeIds.length > 0) {
    try {
      const episodeMessages = await client.getMessages('AnimeKTe', { ids: episodeIds });
      const episodeThreads = new Map<number, number>();
      episodeMessages.forEach((message) => {
        const topicId = message.replyTo?.replyToTopId ?? message.replyTo?.replyToMsgId;
        if (topicId) episodeThreads.set(message.id, topicId);
      });
      const topicIds = [...new Set(episodeThreads.values())];
      const episodesByTopic = new Map<number, Api.Message[]>();
      await Promise.all(topicIds.map(async (topicId) => {
        const topicMessages = await client.getMessages('AnimeKTe', { replyTo: topicId, limit: 100 });
        const episodes = topicMessages
          .filter((message): message is Api.Message => message instanceof Api.Message)
          .filter(isEpisodeVideoMessage)
          .sort((first, second) => second.id - first.id);
        episodesByTopic.set(topicId, episodes);
      }));
      activities.forEach((activity) => {
        const episodeId = activity.episodeId ? Number(activity.episodeId) : null;
        if (episodeId !== null) {
          const topicId = episodeThreads.get(episodeId);
          const anime = animesById.get(activity.animeId);
          if (topicId) {
            const topicEpisodes = episodesByTopic.get(topicId) ?? [];
            const episodeIndex = topicEpisodes.findIndex((episode) => String(episode.id) === String(episodeId));
            const matchedEpisode = episodeIndex >= 0 ? topicEpisodes[episodeIndex] : undefined;
            if (matchedEpisode) {
              const episodeNumber = getEpisodeNumberFromMessage(matchedEpisode, topicEpisodes.length - episodeIndex);
              activity.episodeLabel = `Episodio ${episodeNumber}`;
            }
            activity.episodeTopicId = String(topicId);
            activity.episodeLanguage = anime?.topicsSub.includes(topicId)
              ? 'Sub'
              : anime?.topicsDub.includes(topicId)
                ? 'Dub'
                : null;
          }
        }
      });
    } catch (error) {
      console.warn('No se pudieron resolver los nombres de episodios de la actividad reciente.', error);
      activities.forEach((activity) => {
        if (activity.episodeId) {
          activity.episodeLabel = null;
          activity.episodeTopicId = null;
          activity.episodeLanguage = null;
        }
      });
    }
  }

  return activities;
}

export async function deleteTelegramMessages(
  client: TelegramClient,
  groupId: NonNullable<Parameters<TelegramClient['deleteMessages']>[0]>,
  messageIdsArray: number[],
): Promise<void> {
  if (messageIdsArray.length === 0) return;
  if (messageIdsArray.some((messageId) => !Number.isSafeInteger(messageId) || messageId <= 0)) {
    throw new Error('Uno o más identificadores de mensajes no son válidos.');
  }

  await client.deleteMessages(groupId, messageIdsArray, { revoke: true });
}

export async function getTelegramCommentsGroup(client: TelegramClient) {
  return getCommentsGroup(client);
}

export async function findCommentThread(
  client: TelegramClient,
  hashtag: string,
): Promise<number | null> {
  const group = await getCommentsGroup(client);
  console.log('Buscando hashtag:', hashtag);
  const recentMessages = await client.getMessages(group, { limit: 50 });
  const rootMessage = recentMessages.find((message) => {
    if (!(message instanceof Api.Message)) return false;
    const text = message.message || '';
    return text.includes(hashtag) && messageHasCommentThreadHashtag(text, hashtag);
  });
  return rootMessage?.id ?? null;
}

export async function sendTelegramComment(
  client: TelegramClient,
  blocks: TelegramCommentDraftBlock[],
  threadId: number,
  replyToMessageId?: number,
): Promise<void> {
  const content = blocks.filter((block) => block.kind === 'image' || block.text.trim());
  if (content.length === 0) throw new Error('El comentario no puede estar vacío.');
  if (content.some((block) => block.kind === 'text' && block.text.length > 3900)) {
    throw new Error('Un bloque de texto supera el límite de caracteres de Telegram.');
  }
  if (content.some((block) => block.kind === 'image' && (!block.file || !block.file.type.startsWith('image/')))) {
    throw new Error('Cada bloque de imagen debe contener un archivo de imagen válido.');
  }
  if (!Number.isSafeInteger(threadId) || threadId <= 0) {
    throw new Error('El identificador del hilo de comentarios no es válido.');
  }

  const group = await getCommentsGroup(client);
  const groupId = createContentGroupId();
  const sentMessageIds: number[] = [];
  try {
    for (const [index, block] of content.entries()) {
      const marker = encodeCommentBlockMarker(groupId, index);
      const replyParams = {
        replyTo: replyToMessageId ?? threadId,
        ...(replyToMessageId === undefined ? {} : { topMsgId: threadId }),
      };
      if (block.kind === 'text') {
        const sent = await client.sendMessage(group, { message: `${block.text}${marker}`, ...replyParams });
        sentMessageIds.push(sent.id);
        continue;
      }

      if (!block.file || !block.file.type.startsWith('image/')) {
        throw new Error('Cada bloque de imagen debe contener un archivo de imagen válido.');
      }
      const media = await uploadPhotoMedia(client, block.file, block.isSpoiler);
      const sent = await client.sendFile(group, {
        file: media,
        caption: marker,
        ...replyParams,
        workers: 1,
      });
      sentMessageIds.push(sent.id);
    }
  } catch (error) {
    if (sentMessageIds.length > 0) {
      try {
        await deleteTelegramMessages(client, group, sentMessageIds);
      } catch (cleanupError) {
        const originalMessage = error instanceof Error ? error.message : String(error);
        const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        throw new Error(`No se pudo completar el comentario (${originalMessage}) ni limpiar los bloques parciales (${cleanupMessage}).`);
      }
    }
    throw error;
  }
}

async function imageUrlToFile(mediaUrl: string): Promise<File> {
  const response = await fetch(mediaUrl);
  if (!response.ok) throw new Error('No se pudo recuperar una imagen existente para editar el comentario.');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('El bloque existente no contiene una imagen válida.');
  const extension = blob.type.toLowerCase() === 'image/jpeg'
    ? 'jpg'
    : blob.type.toLowerCase().split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  return new File([blob], `comentario-imagen.${extension}`, { type: blob.type });
}

async function uploadPhotoMedia(
  client: TelegramClient,
  file: File,
  isSpoiler: boolean,
): Promise<Api.InputMediaUploadedPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('El bloque no contiene una imagen válida.');
  const fileBytes = Buffer.from(new Uint8Array(await file.arrayBuffer()));
  const mimeExtension = file.type.toLowerCase() === 'image/jpeg'
    ? 'jpg'
    : file.type.toLowerCase().split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const fileName = /\.[a-z0-9]{2,5}$/i.test(file.name)
    ? file.name
    : `comentario-imagen.${mimeExtension}`;
  const uploadedFile = await client.uploadFile({
    file: new CustomFile(fileName, file.size, '', fileBytes),
    workers: 1,
  });
  return new Api.InputMediaUploadedPhoto({
    file: uploadedFile,
    ...(isSpoiler ? { spoiler: true } : {}),
  });
}

export async function editTelegramComment(
  client: TelegramClient,
  messageId: number,
  blocks: TelegramCommentDraftBlock[],
  messageIds: string[],
  mediaMessageIds: string[],
  threadId: number,
  replyToMessageId?: number,
  contentGroupId?: string,
): Promise<void> {
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    throw new Error('El identificador del comentario no es válido.');
  }
  const content = blocks.filter((block) => block.kind === 'image' || block.text.trim());
  if (content.length === 0) throw new Error('El comentario no puede quedar vacío.');
  if (content.some((block) => block.kind === 'text' && block.text.length > 3900)) {
    throw new Error('Un bloque de texto supera el límite de caracteres de Telegram.');
  }
  if (content.some((block) => block.kind === 'image' && !block.file && !block.messageId && !block.mediaUrl)) {
    throw new Error('El bloque de imagen no tiene un archivo válido.');
  }

  const group = await getCommentsGroup(client);
  const groupId = contentGroupId ?? createContentGroupId();
  const rootId = String(messageId);
  const retainedIds = new Set<string>();

  for (const [index, block] of content.entries()) {
    const targetId = block.messageId ?? (index === 0 ? rootId : undefined);
    const marker = encodeCommentBlockMarker(groupId, index);
    const text = block.kind === 'text' ? `${block.text}${marker}` : marker;
    if (!targetId) {
      const replyParams = {
        replyTo: replyToMessageId ?? threadId,
        ...(replyToMessageId === undefined ? {} : { topMsgId: threadId }),
      };
      if (block.kind === 'text') {
        await client.sendMessage(group, { message: text, ...replyParams });
      } else if (block.file || block.mediaUrl) {
        const file = block.file ?? await imageUrlToFile(block.mediaUrl ?? '');
        const media = await uploadPhotoMedia(client, file, block.isSpoiler);
        await client.sendFile(group, {
          file: media,
          caption: marker,
          ...replyParams,
          workers: 1,
        });
      }
      continue;
    }

    const numericId = Number(targetId);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) {
      throw new Error('El identificador de uno de los bloques editados no es válido.');
    }
    retainedIds.add(targetId);
    if (block.kind === 'image' && block.file) {
      const media = await uploadPhotoMedia(client, block.file, block.isSpoiler);
      await client.editMessage(group, { message: numericId, text, file: media });
    } else if (block.kind === 'image') {
      const spoilerChanged = block.originalIsSpoiler !== block.isSpoiler;
      const orderChanged = block.originalIndex !== index;
      if (spoilerChanged || orderChanged) {
        const file = await imageUrlToFile(block.mediaUrl ?? '');
        const media = await uploadPhotoMedia(client, file, block.isSpoiler);
        await client.editMessage(group, { message: numericId, text, file: media });
      }
    } else if (block.kind === 'text' && mediaMessageIds.includes(targetId)) {
      const { _parseMessageText } = await import('telegram/client/messageParse');
      const [message, entities] = await _parseMessageText(client, text, client.parseMode ?? false);
      await client.invoke(new Api.messages.EditMessage({
        peer: await client.getInputEntity(group),
        id: numericId,
        message,
        entities,
        media: new Api.InputMediaEmpty(),
      }));
    } else if (block.kind === 'text' && (
      block.originalIndex !== index || block.originalText !== block.text
    )) {
      await client.editMessage(group, { message: numericId, text });
    }
  }

  const removedIds = messageIds.filter((id) => !retainedIds.has(id));
  if (removedIds.length > 0) {
    const numericIds = removedIds.map(Number);
    if (numericIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      throw new Error('No se pudieron validar los identificadores de los bloques que se eliminarán.');
    }
    await deleteTelegramMessages(client, group, numericIds);
  }
}

function getSenderName(sender: Api.TypeUser | Api.TypeChat | undefined) {
  if (sender instanceof Api.User) {
    return sender.firstName || sender.username || 'Usuario Desconocido';
  }
  if (sender instanceof Api.Chat || sender instanceof Api.Channel) {
    return sender.title || 'Usuario Desconocido';
  }
  return 'Usuario Desconocido';
}

function getAvatar(username: string) {
  return username
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? '')
    .join('') || '?';
}

export async function fetchComments(
  client: TelegramClient,
  threadId: number,
  offsetId = 0,
): Promise<TelegramCommentsPage> {
  if (!client.connected) {
    await client.connect();
  }
  if (!Number.isSafeInteger(threadId) || threadId <= 0) {
    throw new Error('El identificador del hilo de comentarios no es válido.');
  }
  const group = await getCommentsGroup(client);

  let result: Api.messages.TypeMessages;
  try {
    result = await client.invoke(new Api.messages.GetReplies({
      peer: group,
      msgId: threadId,
      offsetId,
      offsetDate: 0,
      addOffset: 0,
      limit: 20,
      maxId: 0,
      minId: 0,
      hash: bigInt.zero,
    }));
  } catch (error) {
    if (error instanceof Error && error.message.includes('MSG_ID_INVALID')) {
      return { comments: [], hasMore: false, nextOffsetId: null };
    }
    throw error;
  }

  const messages = result instanceof Api.messages.Messages ||
    result instanceof Api.messages.MessagesSlice ||
    result instanceof Api.messages.ChannelMessages
    ? result.messages
    : [];
  const users = result instanceof Api.messages.Messages ||
    result instanceof Api.messages.MessagesSlice ||
    result instanceof Api.messages.ChannelMessages
    ? result.users
    : [];
  const chats = result instanceof Api.messages.Messages ||
    result instanceof Api.messages.MessagesSlice ||
    result instanceof Api.messages.ChannelMessages
    ? result.chats
    : [];
  const sendersById = new Map<string, Api.TypeUser | Api.TypeChat>();
  users.forEach((user) => {
    if (user instanceof Api.User) sendersById.set(user.id.toString(), user);
  });
  chats.forEach((chat) => {
    if (chat instanceof Api.Chat || chat instanceof Api.Channel) {
      sendersById.set(chat.id.toString(), chat);
      sendersById.set(utils.getPeerId(chat, true), chat);
    }
  });
  const commentMessages = messages.filter((message) => message instanceof Api.Message);
  const parsedMessages: Array<{
    message: Api.Message;
    groupedId?: string;
    contentGroupId?: string;
    contentIndex?: number;
    comment: TelegramComment;
  }> = [];
  for (const [index, message] of commentMessages.entries()) {
      const fromId = message.fromId;
      const rawSenderId = fromId instanceof Api.PeerUser
        ? fromId.userId.toString()
        : fromId instanceof Api.PeerChat
          ? fromId.chatId.toString()
          : fromId instanceof Api.PeerChannel
            ? fromId.channelId.toString()
            : undefined;
      const messageSenderId = message.senderId?.toString() ?? rawSenderId;
      let sender = message.sender;
      if (!sender && typeof message.getSender === 'function') {
        try {
          sender = await message.getSender();
        } catch (error) {
          console.warn(`No se pudo resolver el remitente del comentario ${message.id}.`, error);
        }
      }
      if (!sender && messageSenderId) {
        sender = sendersById.get(messageSenderId) ??
          (rawSenderId ? sendersById.get(rawSenderId) : undefined);
      }
      const senderId = sender instanceof Api.User ||
        sender instanceof Api.Chat ||
        sender instanceof Api.Channel
        ? sender.id.toString()
        : messageSenderId;
      const userId = senderId || 'unknown';
      const username = getSenderName(sender);
      const date = new Date(message.date * 1000);
      const marker = stripCommentBlockMarker(message.message);
      let mediaUrl: string | null = null;
      if (
        message.media instanceof Api.MessageMediaPhoto ||
        (message.media instanceof Api.MessageMediaDocument &&
          message.media.document instanceof Api.Document &&
          message.media.document.mimeType.startsWith('image/'))
      ) {
        try {
          const mimeType = message.media instanceof Api.MessageMediaDocument &&
              message.media.document instanceof Api.Document
              ? message.media.document.mimeType
              : 'image/jpeg';
          mediaUrl = await getCommentMediaUrl(client, message, mimeType);
        } catch (mediaError) {
          const messageText = mediaError instanceof Error ? mediaError.message : String(mediaError);
          console.warn('Media omitida por desconexión:', messageText);
          mediaUrl = null;
        }
      }

      parsedMessages.push({
        message,
        groupedId: message.groupedId?.toString(),
        ...(marker.groupId ? { contentGroupId: marker.groupId } : {}),
        ...(marker.index !== undefined ? { contentIndex: marker.index } : {}),
        comment: {
          id: String(message.id),
          userId,
          username,
          avatar: getAvatar(username === 'Usuario Desconocido' ? userId : username),
          ...(message.groupedId ? { groupedId: message.groupedId.toString() } : {}),
          ...(marker.groupId ? { contentGroupId: marker.groupId } : {}),
          ...(message.replyToMsgId !== undefined ? { replyToMessageId: String(message.replyToMsgId) } : {}),
          messageIds: [String(message.id)],
          text: marker.text,
          mediaUrls: mediaUrl ? [mediaUrl] : [],
          contentBlocks: [
            ...(marker.text.trim() ? [{
              kind: 'text' as const,
              text: marker.text,
              messageId: String(message.id),
              index: marker.index ?? 0,
            }] : []),
            ...(mediaUrl ? [{
              kind: 'image' as const,
              mediaUrl,
              messageId: String(message.id),
              isSpoiler:
                (message.media instanceof Api.MessageMediaPhoto ||
                  message.media instanceof Api.MessageMediaDocument) &&
                message.media.spoiler === true,
              index: marker.index ?? 0,
            }] : []),
          ],
          likes: getReactionCount(message, '👍'),
          dislikes: getReactionCount(message, '👎'),
          userReaction: getUserReaction(message),
          replies: [],
          time: date.toLocaleString(),
          timestamp: date.getTime(),
          color: avatarColors[index % avatarColors.length],
        },
      });
  }

  const groupedEntries: typeof parsedMessages = [];
  const groupedById = new Map<string, (typeof parsedMessages)[number]>();
  const groupedByContentId = new Map<string, (typeof parsedMessages)[number]>();
  const entryByMessageId = new Map<string, (typeof parsedMessages)[number]>();
  parsedMessages.forEach((entry) => {
    const existingContentGroup = entry.contentGroupId
      ? groupedByContentId.get(entry.contentGroupId)
      : undefined;
    if (existingContentGroup) {
      const existingComment = existingContentGroup.comment;
      existingComment.contentBlocks = [...(existingComment.contentBlocks ?? []), ...(entry.comment.contentBlocks ?? [])]
        .sort((left, right) => left.index - right.index);
      existingComment.messageIds.push(...entry.comment.messageIds);
      existingComment.mediaUrls.push(...entry.comment.mediaUrls);
      existingComment.text = existingComment.contentBlocks
        .filter((block): block is Extract<TelegramCommentContentBlock, { kind: 'text' }> => block.kind === 'text')
        .map((block) => block.text)
        .join('\n');
      if (entry.contentIndex === 0) {
        existingContentGroup.message = entry.message;
        existingContentGroup.comment.id = entry.comment.id;
        existingContentGroup.comment.replyToMessageId = entry.comment.replyToMessageId;
      }
      entryByMessageId.set(entry.comment.id, existingContentGroup);
      return;
    }
    if (entry.contentGroupId) {
      groupedByContentId.set(entry.contentGroupId, entry);
      groupedEntries.push(entry);
      entryByMessageId.set(entry.comment.id, entry);
      return;
    }

    const existing = entry.groupedId ? groupedById.get(entry.groupedId) : undefined;
    if (existing) {
      existing.comment.mediaUrls.push(...entry.comment.mediaUrls);
      existing.comment.messageIds.push(...entry.comment.messageIds);
      existing.comment.contentBlocks = [...(existing.comment.contentBlocks ?? []), ...(entry.comment.contentBlocks ?? [])]
        .sort((left, right) => left.index - right.index);
      if (!existing.comment.text && entry.comment.text) existing.comment.text = entry.comment.text;
      entryByMessageId.set(entry.comment.id, existing);
      return;
    }

    groupedEntries.push(entry);
    if (entry.groupedId) groupedById.set(entry.groupedId, entry);
    entryByMessageId.set(entry.comment.id, entry);
  });

  const commentsById = new Map(
    [...entryByMessageId].map(([messageId, entry]) => [messageId, entry.comment]),
  );
  const rootComments: TelegramComment[] = [];

  groupedEntries.forEach(({ message, comment }) => {
    const parentId = message.replyToMsgId === undefined ? null : String(message.replyToMsgId);
    const parent = parentId ? commentsById.get(parentId) : undefined;
    if (parent && parent.id !== comment.id) parent.replies.push(comment);
    else rootComments.push(comment);
  });

  const page: TelegramCommentsPage = {
    comments: rootComments,
    hasMore: commentMessages.length === 20,
    nextOffsetId: commentMessages.length > 0 ? commentMessages[commentMessages.length - 1].id : null,
  };
  if (offsetId === 0) cacheComments(threadId, page.comments);
  return page;
}
