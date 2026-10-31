'use client';

import { TelegramClient } from 'telegram/client/TelegramClient';
import { StringSession } from 'telegram/sessions/StringSession';
import { Api } from 'telegram/tl';
import {
  deleteTelegramMessages,
  editTelegramComment,
  fetchComments as fetchTelegramComments,
  findCommentThread as findTelegramCommentThread,
  getTelegramCommentsGroup,
  getProfilePic as getTelegramProfilePic,
  sendTelegramComment,
} from '@/lib/telegramComments';
import type {
  TelegramCommentDraftBlock,
  TelegramCommentsPage,
} from '@/lib/telegramComments';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';

type TelegramUser = {
  id: string;
  firstName: string;
  username: string | null;
};

type TelegramContextValue = {
  client: TelegramClient | null;
  isAuthenticated: boolean;
  currentUserId: string | null;
  user: TelegramUser | null;
  isLoading: boolean;
  profilePhotoUrl: string | null;
  initClient: (apiId: string, apiHash: string) => Promise<boolean>;
  sendCode: (phoneNumber: string) => Promise<boolean>;
  verifyCode: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  sendComment: (blocks: TelegramCommentDraftBlock[], threadId: number, replyToMessageId?: number) => Promise<void>;
  deleteCommentMessages: (messageIds: number[]) => Promise<void>;
  editComment: (
    messageId: number,
    blocks: TelegramCommentDraftBlock[],
    messageIds: string[],
    mediaMessageIds: string[],
    threadId: number,
    replyToMessageId?: number,
    contentGroupId?: string,
  ) => Promise<void>;
  getProfilePic: (userId: string) => Promise<string | null>;
  fetchComments: (threadId: number, offsetId?: number) => Promise<TelegramCommentsPage>;
  findCommentThread: (hashtag: string) => Promise<number | null>;
};

const TelegramContext = createContext<TelegramContextValue | undefined>(undefined);

const SESSION_KEY = 'telegram_session';
const API_ID_KEY = 'user_api_id';
const API_HASH_KEY = 'user_api_hash';

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isInvalidApiCredentials(error: unknown) {
  return /API_(?:ID|HASH)_INVALID/i.test(errorText(error));
}

export function TelegramProvider({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const [client, setClient] = useState<TelegramClient | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const clientRef = useRef<TelegramClient | null>(null);
  const credentialsRef = useRef<{ apiId: number; apiHash: string } | null>(null);
  const phoneNumberRef = useRef('');
  const phoneCodeHashRef = useRef('');
  const restoreStarted = useRef(false);

  const clearAuthState = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(API_ID_KEY);
    localStorage.removeItem(API_HASH_KEY);

    const previousClient = clientRef.current;
    clientRef.current = null;
    credentialsRef.current = null;
    phoneNumberRef.current = '';
    phoneCodeHashRef.current = '';
    setClient(null);
    setIsAuthenticated(false);
    setCurrentUserId(null);
    setUser(null);

    if (previousClient) {
      void previousClient.disconnect().catch((error: unknown) => {
        console.error('No se pudo cerrar el cliente de Telegram anterior.', error);
      });
    }
  }, []);

  const handleAuthError = useCallback((error: unknown) => {
    if (isInvalidApiCredentials(error)) clearAuthState();
  }, [clearAuthState]);

  const initClient = useCallback(async (apiIdValue: string, apiHash: string) => {
    const parsedApiId = Number(apiIdValue);
    if (!/^\d+$/.test(apiIdValue) || !Number.isSafeInteger(parsedApiId) || !apiHash) {
      throw new Error('Introduce un API ID numérico y un API HASH válido.');
    }

    setIsLoading(true);
    setIsAuthenticated(false);
    setCurrentUserId(null);
    setUser(null);
    try {
      const previousClient = clientRef.current;
      if (previousClient) {
        await previousClient.disconnect();
        clientRef.current = null;
        setClient(null);
      }

      const savedSession = localStorage.getItem(SESSION_KEY) ?? '';
      const nextClient = new TelegramClient(
        new StringSession(savedSession),
        parsedApiId,
        apiHash,
        {
          connectionRetries: 5,
          deviceModel: 'AnimeKT Web',
          systemVersion: '1.0.0',
          appVersion: '1.0.0',
          useWSS: true,
        },
      );

      clientRef.current = nextClient;
      credentialsRef.current = { apiId: parsedApiId, apiHash };
      await nextClient.connect();
      const authorized = await nextClient.checkAuthorization();

      setClient(nextClient);
      if (authorized) {
        const currentUser = await nextClient.getMe();
        setCurrentUserId(currentUser.id.toString());
        setUser({
          id: currentUser.id.toString(),
          firstName: currentUser.firstName ?? '',
          username: currentUser.username ?? null,
        });
      } else {
        setCurrentUserId(null);
        setUser(null);
      }
      setIsAuthenticated(authorized);
      return authorized;
    } catch (error) {
      handleAuthError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [handleAuthError, router]);

  const sendCode = useCallback(async (phoneNumber: string) => {
    const activeClient = clientRef.current;
    const credentials = credentialsRef.current;
    if (!activeClient || !credentials) {
      throw new Error('Primero introduce y valida tus credenciales de API.');
    }
    if (!phoneNumber.trim()) throw new Error('Introduce un número de teléfono válido.');

    setIsLoading(true);
    try {
      const result = await activeClient.sendCode(credentials, phoneNumber.trim());
      phoneNumberRef.current = phoneNumber.trim();
      phoneCodeHashRef.current = result.phoneCodeHash;
      return result.isCodeViaApp;
    } catch (error) {
      handleAuthError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [handleAuthError]);

  const verifyCode = useCallback(async (code: string) => {
    const activeClient = clientRef.current;
    const credentials = credentialsRef.current;
    const phoneCodeHash = phoneCodeHashRef.current;
    if (!activeClient || !credentials || !phoneCodeHash || !phoneNumberRef.current) {
      throw new Error('Solicita un código de verificación antes de continuar.');
    }
    if (!code.trim()) throw new Error('Introduce el código de verificación.');

    setIsLoading(true);
    try {
      const authorization = await activeClient.invoke(
        new Api.auth.SignIn({
          phoneNumber: phoneNumberRef.current,
          phoneCodeHash,
          phoneCode: code.trim(),
        }),
      );

      if (authorization instanceof Api.auth.AuthorizationSignUpRequired) {
        throw new Error('Este número todavía no tiene una cuenta de Telegram registrada.');
      }

      const currentSession = activeClient.session;
      if (!(currentSession instanceof StringSession)) {
        throw new Error('No se pudo recuperar la sesión de Telegram para guardarla.');
      }
      const session = currentSession.save();
      localStorage.setItem(API_ID_KEY, String(credentials.apiId));
      localStorage.setItem(API_HASH_KEY, credentials.apiHash);
      localStorage.setItem(SESSION_KEY, session);

      const currentUser = await activeClient.getMe();
      setCurrentUserId(currentUser.id.toString());
      setUser({
        id: currentUser.id.toString(),
        firstName: currentUser.firstName ?? '',
        username: currentUser.username ?? null,
      });
      setIsAuthenticated(true);
      router.push('/home');
    } catch (error) {
      handleAuthError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [handleAuthError, router]);

  const logout = useCallback(async () => {
    const previousClient = clientRef.current;
    clientRef.current = null;
    credentialsRef.current = null;
    phoneNumberRef.current = '';
    phoneCodeHashRef.current = '';
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(API_ID_KEY);
    localStorage.removeItem(API_HASH_KEY);
    setClient(null);
    setIsAuthenticated(false);
    setCurrentUserId(null);
    setUser(null);

    if (previousClient) {
      try {
        await previousClient.disconnect();
      } catch (error) {
        console.error('No se pudo desconectar limpiamente la sesión de Telegram.', error);
      }
    }

    router.push('/');
  }, [router]);

  const sendComment = useCallback(async (
    blocks: TelegramCommentDraftBlock[],
    threadId: number,
    replyToMessageId?: number,
  ) => {
    const activeClient = clientRef.current;
    if (!activeClient || !isAuthenticated) {
      throw new Error('Conecta una sesión autenticada de Telegram antes de comentar.');
    }

    return sendTelegramComment(activeClient, blocks, threadId, replyToMessageId);
  }, [isAuthenticated]);

  const editComment = useCallback(async (
    messageId: number,
    blocks: TelegramCommentDraftBlock[],
    messageIds: string[],
    mediaMessageIds: string[],
    threadId: number,
    replyToMessageId?: number,
    contentGroupId?: string,
  ) => {
    const activeClient = clientRef.current;
    if (!activeClient || !isAuthenticated) {
      throw new Error('Conecta una sesión autenticada de Telegram para editar comentarios.');
    }
    return editTelegramComment(
      activeClient,
      messageId,
      blocks,
      messageIds,
      mediaMessageIds,
      threadId,
      replyToMessageId,
      contentGroupId,
    );
  }, [isAuthenticated]);

  const deleteCommentMessages = useCallback(async (messageIds: number[]) => {
    const activeClient = clientRef.current;
    if (!activeClient || !isAuthenticated) {
      throw new Error('Conecta una sesión autenticada de Telegram para eliminar comentarios.');
    }
    const group = await getTelegramCommentsGroup(activeClient);
    await deleteTelegramMessages(activeClient, group, messageIds);
  }, [isAuthenticated]);

  const getProfilePic = useCallback(async (userId: string) => {
    const activeClient = clientRef.current;
    if (!activeClient || !isAuthenticated) return null;
    return getTelegramProfilePic(activeClient, userId);
  }, [isAuthenticated]);

  const fetchCommentsForThread = useCallback(async (threadId: number, offsetId = 0) => {
    const activeClient = clientRef.current;
    if (!activeClient || !isAuthenticated) {
      throw new Error('Conecta una sesión autenticada de Telegram para ver los comentarios.');
    }
    return fetchTelegramComments(activeClient, threadId, offsetId);
  }, [isAuthenticated]);

  const findCommentThread = useCallback(async (hashtag: string) => {
    const activeClient = clientRef.current;
    if (!activeClient || !isAuthenticated) {
      throw new Error('Conecta una sesión autenticada de Telegram para buscar el hilo.');
    }
    return findTelegramCommentThread(activeClient, hashtag);
  }, [isAuthenticated]);

  useEffect(() => {
    if (restoreStarted.current) return;
    restoreStarted.current = true;

    const savedSession = localStorage.getItem(SESSION_KEY);
    const savedApiId = localStorage.getItem(API_ID_KEY);
    const savedApiHash = localStorage.getItem(API_HASH_KEY);
    if (!savedSession || !savedApiId || !savedApiHash) {
      setIsLoading(false);
      return;
    }

    void initClient(savedApiId, savedApiHash).catch((error: unknown) => {
      console.error('No se pudo restaurar la sesión de Telegram.', error);
    });
  }, [initClient]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error('No se pudo registrar el Service Worker de streaming.', error);
    });
  }, []);

  useEffect(() => {
    if (!client || !isAuthenticated) {
      setProfilePhotoUrl(null);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    void client.downloadProfilePhoto('me', { isBig: false }).then((photo) => {
      if (!photo || photo.length === 0) return;
      if (typeof photo === 'string') {
        throw new Error('Telegram devolvió una ruta de archivo en lugar de datos de imagen.');
      }
      const blob = new Blob([Uint8Array.from(photo)], { type: 'image/jpeg' });
      objectUrl = URL.createObjectURL(blob);
      if (active) setProfilePhotoUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch((error: unknown) => {
      console.error('No se pudo cargar la foto de perfil de Telegram.', error);
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, isAuthenticated]);

  const value = useMemo(
    () => ({
      client,
      isAuthenticated,
      currentUserId,
      user,
      isLoading,
      profilePhotoUrl,
      initClient,
      sendCode,
      verifyCode,
      logout,
      sendComment,
      deleteCommentMessages,
      editComment,
      getProfilePic,
      fetchComments: fetchCommentsForThread,
      findCommentThread,
    }),
    [client, isAuthenticated, currentUserId, user, isLoading, profilePhotoUrl, initClient, sendCode, verifyCode, logout, sendComment, deleteCommentMessages, editComment, getProfilePic, fetchCommentsForThread, findCommentThread],
  );

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}

export function useTelegram() {
  const context = useContext(TelegramContext);
  if (!context) throw new Error('useTelegram debe usarse dentro de TelegramProvider.');
  return context;
}
