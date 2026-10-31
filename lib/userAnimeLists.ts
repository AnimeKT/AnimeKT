'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getSupabaseClient } from '@/lib/supabase';

export type UserAnimeLists = {
  watchlist: string[];
  favorites: string[];
  watched: string[];
};

export type UserAnimeListName = keyof UserAnimeLists;

type ListsSnapshot = {
  lists: UserAnimeLists;
  isLoading: boolean;
  error: string | null;
};

type UserListsStore = {
  snapshot: ListsSnapshot;
  listeners: Set<() => void>;
  itemVersions: Map<string, number>;
  pendingMemberships: Map<string, {
    listType: UserAnimeListName;
    animeId: string;
    included: boolean;
  }>;
  version: number;
  loadPromise: Promise<UserAnimeLists> | null;
  writeQueue: Promise<void>;
};

const EMPTY_LISTS: UserAnimeLists = { watchlist: [], favorites: [], watched: [] };
const EMPTY_SNAPSHOT: ListsSnapshot = {
  lists: EMPTY_LISTS,
  isLoading: false,
  error: null,
};
const userListsStores = new Map<string, UserListsStore>();

function createStore(): UserListsStore {
  return {
    snapshot: { lists: EMPTY_LISTS, isLoading: true, error: null },
    listeners: new Set(),
    itemVersions: new Map(),
    pendingMemberships: new Map(),
    version: 0,
    loadPromise: null,
    writeQueue: Promise.resolve(),
  };
}

function getStore(userId: string): UserListsStore {
  let store = userListsStores.get(userId);
  if (!store) {
    store = createStore();
    userListsStores.set(userId, store);
  }
  return store;
}

function notify(store: UserListsStore) {
  store.listeners.forEach((listener) => listener());
}

function updateSnapshot(
  store: UserListsStore,
  update: Partial<ListsSnapshot>,
) {
  store.snapshot = { ...store.snapshot, ...update };
  notify(store);
}

function normalizeIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string')
    : [];
}

function normalizeLists(row: Partial<UserAnimeLists>): UserAnimeLists {
  return {
    watchlist: normalizeIds(row.watchlist),
    favorites: normalizeIds(row.favorites),
    watched: normalizeIds(row.watched),
  };
}

function requireUserId(userId: string | null | undefined): string {
  if (!userId) {
    const message = 'El user_id de Telegram no está disponible';
    console.error(message);
    throw new Error(message);
  }
  return userId;
}

function setMembership(
  lists: UserAnimeLists,
  listType: UserAnimeListName,
  animeId: string,
  included: boolean,
): UserAnimeLists {
  const ids = lists[listType];
  const updatedIds = included
    ? [...new Set([...ids, animeId])]
    : ids.filter((id) => id !== animeId);
  return { ...lists, [listType]: updatedIds };
}

function applyPendingMemberships(store: UserListsStore, lists: UserAnimeLists) {
  let result = lists;
  store.pendingMemberships.forEach(({ listType, animeId, included }) => {
    result = setMembership(result, listType, animeId, included);
  });
  return result;
}

async function loadUserAnimeLists(userId: string, store: UserListsStore) {
  try {
    const { data, error } = await getSupabaseClient()
      .from('user_lists')
      .select('watchlist, favorites, watched')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    let lists: UserAnimeLists;
    if (data) {
      lists = normalizeLists(data);
    } else {
      const { error: insertError } = await getSupabaseClient()
        .from('user_lists')
        .upsert(
          { user_id: userId, ...EMPTY_LISTS },
          { onConflict: 'user_id', ignoreDuplicates: true },
        );
      if (insertError) throw insertError;

      const { data: initialized, error: readError } = await getSupabaseClient()
        .from('user_lists')
        .select('watchlist, favorites, watched')
        .eq('user_id', userId)
        .maybeSingle();
      if (readError) throw readError;
      lists = initialized ? normalizeLists(initialized) : EMPTY_LISTS;
    }

    const mergedLists = applyPendingMemberships(store, lists);
    updateSnapshot(store, { lists: mergedLists, isLoading: false, error: null });
    return store.snapshot.lists;
  } catch (error) {
    console.warn('No se pudieron leer las listas de Supabase; se usarán listas vacías.', error);
    updateSnapshot(store, {
      lists: applyPendingMemberships(store, EMPTY_LISTS),
      isLoading: false,
      error: 'No se pudo cargar tu lista.',
    });
    return store.snapshot.lists;
  }
}

export async function getUserAnimeLists(
  userId: string | null | undefined,
): Promise<UserAnimeLists> {
  const validUserId = requireUserId(userId);
  const store = getStore(validUserId);
  if (!store.snapshot.isLoading) return store.snapshot.lists;

  if (!store.loadPromise) {
    store.loadPromise = loadUserAnimeLists(validUserId, store).finally(() => {
      store.loadPromise = null;
    });
  }
  return store.loadPromise;
}

export function useUserAnimeLists(userId: string | null | undefined): ListsSnapshot {
  const snapshot = useSyncExternalStore(
    (onStoreChange) => {
      if (!userId) return () => {};
      const store = getStore(userId);
      store.listeners.add(onStoreChange);
      return () => store.listeners.delete(onStoreChange);
    },
    () => (userId ? getStore(userId).snapshot : EMPTY_SNAPSHOT),
    () => EMPTY_SNAPSHOT,
  );

  useEffect(() => {
    if (userId) void getUserAnimeLists(userId);
  }, [userId]);

  return snapshot;
}

export async function setAnimeInUserList(
  userId: string | null | undefined,
  listType: UserAnimeListName,
  animeId: string,
  included: boolean,
): Promise<UserAnimeLists> {
  const validUserId = requireUserId(userId);
  const store = getStore(validUserId);
  const itemKey = `${listType}:${animeId}`;
  const previousIncluded = store.snapshot.lists[listType].includes(animeId);
  const operationVersion = ++store.version;
  store.itemVersions.set(itemKey, operationVersion);
  store.pendingMemberships.set(itemKey, { listType, animeId, included });

  updateSnapshot(store, {
    lists: setMembership(store.snapshot.lists, listType, animeId, included),
    error: null,
  });

  const loadPromise = store.loadPromise ?? getUserAnimeLists(validUserId);
  const write = store.writeQueue
    .catch(() => undefined)
    .then(async () => {
      await loadPromise;
      const lists = store.snapshot.lists;
      const { error } = await getSupabaseClient()
        .from('user_lists')
        .upsert(
          {
            user_id: validUserId,
            watchlist: lists.watchlist,
            favorites: lists.favorites,
            watched: lists.watched,
          },
          { onConflict: 'user_id' },
        );
      if (error) throw error;
      if (store.itemVersions.get(itemKey) === operationVersion) {
        store.pendingMemberships.delete(itemKey);
        store.itemVersions.delete(itemKey);
      }
    })
    .catch((error: unknown) => {
      if (store.itemVersions.get(itemKey) === operationVersion) {
        store.version += 1;
        store.itemVersions.delete(itemKey);
        store.pendingMemberships.delete(itemKey);
        updateSnapshot(store, {
          lists: setMembership(store.snapshot.lists, listType, animeId, previousIncluded),
        });
      }
      throw error;
    });

  store.writeQueue = write;
  await write;
  return store.snapshot.lists;
}
