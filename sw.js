// ═══════════════════════════════════════════════════════════════
//  SAVY Service Worker — v3
//  Strategy: Cache-first for assets, Network-first for HTML/API
// ═══════════════════════════════════════════════════════════════

const CACHE     = 'savy-v3';
const API_CACHE = 'savy-api-v1';

// Assets to pre-cache on install (app shell)
const PRECACHE = [
  '/',
  '/index.html',
  '/savy-menu.html',
  '/manifest.json',
  '/images/icon-192.png',
  '/images/icon-512.png',
];

// ── Install: pre-cache app shell ──────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE).catch(() => {}))
  );
});

// ── Activate: clean up old caches ────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE && k !== API_CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: tiered strategy ────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Never intercept: Netlify functions, external APIs, Chrome extensions
  if (
    url.pathname.startsWith('/.netlify/') ||
    url.hostname !== self.location.hostname ||
    request.method !== 'GET'
  ) return;

  // HTML pages — Network first, fall back to cache, then offline page
  if (request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Images — Cache first, fetch & cache on miss
  if (url.pathname.startsWith('/images/')) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          caches.open(CACHE).then(c => c.put(request, res.clone()));
          return res;
        }).catch(() => new Response('', { status: 408 }));
      })
    );
    return;
  }

  // Everything else (fonts, JS, CSS) — stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(request).then(cached => {
        const fresh = fetch(request).then(res => {
          cache.put(request, res.clone());
          return res;
        });
        return cached || fresh;
      })
    )
  );
});

// ── Push notifications ────────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'SAVY', body: e.data.text() }; }

  e.waitUntil(
    self.registration.showNotification(data.title || 'SAVY 🧬', {
      body:    data.body  || 'Votre commande est en route ! 🛵',
      icon:    '/images/icon-192.png',
      badge:   '/images/icon-72.png',
      vibrate: [200, 100, 200],
      data:    { url: data.url || '/' },
      actions: [
        { action: 'track', title: '📍 Suivre', icon: '/images/icon-72.png' },
        { action: 'close', title: '✕ Fermer' },
      ],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'close') return;
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin)) { c.focus(); return c.navigate(url); }
      }
      return clients.openWindow(url);
    })
  );
});

// ── Background sync (retry failed orders) ────────────────────
self.addEventListener('sync', e => {
  if (e.tag === 'savy-order-sync') {
    e.waitUntil(retrySavedOrders());
  }
});

async function retrySavedOrders() {
  // Orders saved to IndexedDB while offline get retried here
  // Implementation hooks into the sheets proxy
  const db = await openDB();
  const pending = await getAllPending(db);
  for (const order of pending) {
    try {
      const res = await fetch('/savy-apps-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
      });
      if (res.ok) await deletePending(db, order.id);
    } catch {}
  }
}

// Minimal IndexedDB helpers for offline orders
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('savy-offline', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('orders', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = e => res(e.target.result);
    req.onerror   = rej;
  });
}
function getAllPending(db) {
  return new Promise((res, rej) => {
    const tx  = db.transaction('orders', 'readonly');
    const req = tx.objectStore('orders').getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = rej;
  });
}
function deletePending(db, id) {
  return new Promise((res, rej) => {
    const tx  = db.transaction('orders', 'readwrite');
    const req = tx.objectStore('orders').delete(id);
    req.onsuccess = res;
    req.onerror   = rej;
  });
}
