import { NextResponse } from 'next/server';
import { buildCommentThreadHashtag } from '@/lib/commentThread';

type CreateThreadRequest = {
  animeId: string | number;
  episodeId?: string | number | null;
  title: string;
};

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  try {
    if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Origen de solicitud no válido.' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Origen de solicitud no válido.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'El cuerpo de la solicitud debe ser JSON válido.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Los datos del anime o episodio no son válidos.' }, { status: 400 });
  }
  const payload = body as Partial<CreateThreadRequest>;
  const isValidId = (value: unknown) => {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
    return typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
  };
  if (
    !isValidId(payload.animeId) ||
    typeof payload.title !== 'string' ||
    payload.title.trim().length === 0 ||
    payload.title.trim() === 'Anime' ||
    payload.title.length > 200 ||
    (payload.episodeId !== undefined && payload.episodeId !== null && !isValidId(payload.episodeId))
  ) {
    return NextResponse.json({ error: 'Los datos del anime o episodio no son válidos.' }, { status: 400 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_ID;
  if (!token || !channelId) {
    console.error('Falta configurar TELEGRAM_BOT_TOKEN o NEXT_PUBLIC_TELEGRAM_CHANNEL_ID.');
    return NextResponse.json({ error: 'El servicio de comentarios no está configurado.' }, { status: 500 });
  }

  const animeId = String(payload.animeId);
  const episodeId = payload.episodeId === undefined || payload.episodeId === null
    ? ''
    : String(payload.episodeId);
  const hashtag = buildCommentThreadHashtag(animeId, episodeId);

  try {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: `Post maestro para: ${payload.title.trim()}\n\n${hashtag}`,
      }),
      cache: 'no-store',
    });
    const result: unknown = await telegramResponse.json();
    if (
      !telegramResponse.ok ||
      typeof result !== 'object' ||
      result === null ||
      !('ok' in result) ||
      result.ok !== true
    ) {
      console.error('Telegram rechazó la creación del hilo.', {
        status: telegramResponse.status,
        response: result,
      });
      return NextResponse.json({ error: 'Telegram no pudo crear el hilo de comentarios.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('No se pudo contactar con la API de Telegram para crear el hilo.', error);
    return NextResponse.json({ error: 'No se pudo crear el hilo de comentarios.' }, { status: 502 });
  }
}
