import { Api } from 'telegram/tl';
import type { TelegramClient } from 'telegram/client/TelegramClient';

export async function getTelegramForumTopicNames(
  client: TelegramClient,
  group: string,
  topicIds: number[],
) {
  const validTopicIds = [...new Set(topicIds.filter(
    (topicId) => Number.isSafeInteger(topicId) && topicId > 0,
  ))];
  if (validTopicIds.length === 0) return new Map<number, string>();

  const result = await client.invoke(new Api.channels.GetForumTopicsByID({
    channel: group,
    topics: validTopicIds,
  }));
  if (!(result instanceof Api.messages.ForumTopics)) {
    throw new Error('Telegram devolvió una respuesta inesperada al consultar los Topics.');
  }

  const names = new Map<number, string>();
  for (const topic of result.topics) {
    if (topic instanceof Api.ForumTopic) names.set(topic.id, topic.title);
  }
  return names;
}
