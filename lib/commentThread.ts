export function buildCommentThreadHashtag(
  animeId: string | number,
  episodeId?: string | number | null,
) {
  return `#anime_${animeId}${episodeId ? `_ep_${episodeId}` : '_general'}`;
}

export function messageHasCommentThreadHashtag(message: string, hashtag: string) {
  const escapedHashtag = hashtag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escapedHashtag}(?=$|\\s)`).test(message);
}
