const CHUNK_SIZE = 1024 * 1024;
const requestTimeoutMs = 60_000;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith('/stream/')) return;

  const fileId = decodeURIComponent(url.pathname.slice('/stream/'.length));
  event.respondWith(handleStreamRequest(event, fileId, url));
});

async function handleStreamRequest(event, fileId, url) {
  let totalSize;
  try {
    totalSize = BigInt(url.searchParams.get('size') || '');
  } catch {
    return new Response('Tamaño de archivo no válido.', { status: 400 });
  }
  if (totalSize <= 0n) return new Response('Tamaño de archivo no válido.', { status: 400 });
  const requestedMimeType = url.searchParams.get('type') || 'video/mp4';
  const mimeType = /^video\/[a-z0-9.+-]+$/i.test(requestedMimeType) ? requestedMimeType : 'video/mp4';
  const baseHeaders = {
    'Accept-Ranges': 'bytes',
    'Content-Type': mimeType,
    'Cache-Control': 'no-store',
  };

  if (event.request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': totalSize.toString() },
    });
  }
  if (event.request.method !== 'GET') {
    return new Response('Método no permitido.', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const rangeHeader = event.request.headers.get('range');
  let rangeStart = 0n;
  let rangeEnd = totalSize - 1n;
  if (rangeHeader) {
    const rangeMatch = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!rangeMatch || (!rangeMatch[1] && !rangeMatch[2])) {
      return new Response(null, {
        status: 416,
        headers: { ...baseHeaders, 'Content-Range': `bytes */${totalSize}` },
      });
    }

    if (!rangeMatch[1]) {
      const suffixLength = BigInt(rangeMatch[2]);
      if (suffixLength === 0n) {
        return new Response(null, {
          status: 416,
          headers: { ...baseHeaders, 'Content-Range': `bytes */${totalSize}` },
        });
      }
      rangeStart = suffixLength >= totalSize ? 0n : totalSize - suffixLength;
    } else {
      rangeStart = BigInt(rangeMatch[1]);
      if (rangeMatch[2]) rangeEnd = BigInt(rangeMatch[2]);
    }
  }

  if (rangeStart >= totalSize || rangeEnd < rangeStart) {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, 'Content-Range': `bytes */${totalSize}` },
    });
  }

  rangeEnd = rangeEnd >= totalSize ? totalSize - 1n : rangeEnd;
  const chunkEnd = rangeEnd < rangeStart + BigInt(CHUNK_SIZE) - 1n
    ? rangeEnd
    : rangeStart + BigInt(CHUNK_SIZE) - 1n;
  let client = event.clientId ? await self.clients.get(event.clientId) : null;
  if (!client) {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    client = windowClients.find((candidate) => new URL(candidate.url).origin === url.origin);
  }
  if (!client) return new Response('La pestaña que transmite el vídeo ya no está disponible.', { status: 503 });

  try {
    const bytes = await requestVideoChunk(client, {
      fileId,
      start: rangeStart.toString(),
      end: chunkEnd.toString(),
      size: totalSize.toString(),
    });
    const actualEnd = rangeStart + BigInt(bytes.byteLength) - 1n;

    return new Response(bytes, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        ...baseHeaders,
        'Content-Length': String(bytes.byteLength),
        'Content-Range': `bytes ${rangeStart}-${actualEnd}/${totalSize}`,
      },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

function requestVideoChunk(client, request) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      channel.port1.close();
      reject(new Error('La pestaña tardó demasiado en obtener datos de Telegram.'));
    }, requestTimeoutMs);

    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      channel.port1.close();
      if (event.data?.error) {
        reject(new Error(event.data.error));
        return;
      }
      resolve(new Uint8Array(event.data.chunk));
    };

    client.postMessage({ type: 'REQUEST_CHUNK', ...request }, [channel.port2]);
  });
}
