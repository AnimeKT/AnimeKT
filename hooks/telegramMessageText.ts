import type { TelegramAnimeMessage } from '@/hooks/anime';

const EMOJI_NUMBERS: Record<string, string> = {
  '5215582188594016044': '1',
  '5217780859662250453': '2',
  '5217890123630260160': '3',
  '5217751121308690608': '4',
  '5217881379076843813': '5',
  '5215728329151228731': '6',
  '5217787607055869474': '7',
  '5217949372704108415': '8',
  '5217907505362907029': '9',
  '5217565067620394545': '0',
};

export function getTelegramMessageText(message: TelegramAnimeMessage) {
  let text = message.message || '';

  if (message.entities) {
    const entities = [...message.entities].sort((first, second) => second.offset - first.offset);
    for (const entity of entities) {
      if (entity.className !== 'MessageEntityCustomEmoji' || !('documentId' in entity) || !entity.documentId) {
        continue;
      }

      const number = EMOJI_NUMBERS[entity.documentId.toString()];
      if (number) {
        text = text.substring(0, entity.offset) + number + text.substring(entity.offset + entity.length);
      }
    }
  }

  return text;
}
