const CACHE_NAME = 'volttype-v4';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Offline fallback page (embedded HTML)
const OFFLINE_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VoltType — Offline</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 24px;
    }
    h1 {
      font-size: 28px;
      font-weight: 900;
      background: linear-gradient(135deg, #7c3aed, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 16px;
    }
    p { color: #94a3b8; font-size: 16px; margin-bottom: 12px; max-width: 400px; }
    .retry {
      margin-top: 24px;
      padding: 12px 32px;
      background: linear-gradient(135deg, #7c3aed, #3b82f6);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <h1>VoltType</h1>
  <p>You appear to be offline. The desktop app works without internet if you have your own API key configured.</p>
  <p style="font-size: 14px;">Check your connection and try again.</p>
  <button class="retry" onclick="location.reload()">Try Again</button>
</body>
</html>`;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async c => {
      await c.addAll(SHELL);
      // Cache the offline page
      await c.put('/offline.html', new Response(OFFLINE_PAGE, {
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
    ).then(() => self.clients.claim()).then(() => {
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME }));
      });
    })
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // For navigation requests, use network-first strategy with offline fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          // Cache the latest version
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return response;
        })
        .catch(() =>
          caches.match(e.request).then(cached => cached || caches.match('/offline.html'))
        )
    );
    return;
  }

  // For other requests, use cache-first strategy
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request)
        .then(response => {
          // Cache static assets
          if (response.ok && (e.request.url.includes('/icons/') || e.request.url.endsWith('.css') || e.request.url.endsWith('.js'))) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/offline.html'));
    })
  );
});
