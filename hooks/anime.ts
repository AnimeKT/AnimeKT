import type { Api } from 'telegram/tl';

export type TelegramAnimeMessage = Api.Message;

export type AnimeData = {
  id: string;
  message: TelegramAnimeMessage;
  heroMessage: TelegramAnimeMessage;
  title: string;
  alternativeTitles: string;
  meta: string;
  synopsis: string;
  status: string;
  type: string;
  year: string;
  day: string;
  audio: string;
  studio: string;
  author: string;
  genres: string[];
  genresText: string;
  searchableText: string;
  topicsSub: number[];
  topicsDub: number[];
};
