const CACHE_NAME = 'volttype-pwa-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VoltType - Offline</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, system-ui, sans-serif;
      background: #0c1222; color: #e2e8f0;
      min-height: 100vh; display: flex;
      flex-direction: column; align-items: center;
      justify-content: center; text-align: center; padding: 24px;
    }
    h1 { font-size: 24px; margin-bottom: 12px;
      background: linear-gradient(135deg, #38bd9c, #3b82f6);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    p { color: #94a3b8; font-size: 15px; margin-bottom: 8px; }
    button { margin-top: 20px; padding: 12px 28px; background: #38bd9c;
      color: white; border: none; border-radius: 10px; font-size: 15px;
      font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <h1>VoltType</h1>
  <p>You are offline.</p>
  <p>Voice typing requires an internet connection for transcription.</p>
  <button onclick="location.reload()">Retry</button>
</body>
</html>`;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async c => {
      await c.addAll(SHELL);
      await c.put('/offline.html', new Response(OFFLINE_HTML, {
        headers: { 'Content-Type': 'text/html' }
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // Don't cache API calls
  if (e.request.url.includes('volttype-api') || e.request.url.includes('supabase')) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => { const c = r.clone(); caches.open(CACHE_NAME).then(cache => cache.put(e.request, c)); return r; })
        .catch(() => caches.match(e.request).then(c => c || caches.match('/offline.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match('/offline.html')))
  );
});
