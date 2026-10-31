ALTER TABLE public.user_lists
ADD COLUMN IF NOT EXISTS watchlist text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.user_lists
SET watchlist = favorites,
    favorites = '{}'
WHERE COALESCE(array_length(watchlist, 1), 0) = 0
  AND COALESCE(array_length(favorites, 1), 0) > 0;
