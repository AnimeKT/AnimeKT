// sw.js - El Proxy Interceptor corregido
self.addEventListener("install", (event) => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    
    if (url.pathname.startsWith("/stream/")) {
        event.respondWith(handleStream(event));
    }
});

async function handleStream(event) {
    let client = await self.clients.get(event.clientId);
    
    if (!client) {
        const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        client = allClients[0]; 
    }

    if (!client) return new Response("Error: Pestaña principal no encontrada", { status: 500 });

    return new Promise((resolve) => {
        const messageChannel = new MessageChannel();
        
        messageChannel.port1.onmessage = (msgEvent) => {
            if (msgEvent.data.error) {
                return resolve(new Response("Error en streaming", { status: 500 }));
            }

            const { chunk, size, rangeStart, rangeEnd } = msgEvent.data;
            
            // 🔧 CORRECCIÓN AQUÍ: El tamaño total debe ser ${size} exacto, no ${size - 1}
            const response = new Response(chunk, {
                status: 206,
                statusText: "Partial Content",
                headers: {
                    "Content-Type": "video/mp4",
                    "Content-Length": chunk.byteLength,
                    "Content-Range": `bytes ${rangeStart}-${rangeEnd}/${size}`,
                    "Accept-Ranges": "bytes"
                }
            });
            resolve(response);
        };

        client.postMessage({
            type: "REQUEST_CHUNK",
            url: event.request.url,
            headers: Object.fromEntries(event.request.headers.entries())
        }, [messageChannel.port2]);
    });
}