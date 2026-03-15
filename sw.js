// SAVY Service Worker — v1.0
// Caches the app shell for offline use

const CACHE_NAME   = "savy-v1";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/images/logo_nav.png",
  "/images/icon-192.png",
  "/images/icon-512.png",
];

// ── Install: cache shell assets ──────────────────────────────
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for API, cache-first for assets ─────
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Always go to network for API calls and Google Sheets
  if (
    url.pathname.startsWith("/.netlify/functions/") ||
    url.hostname.includes("script.google.com") ||
    url.hostname.includes("api.groq.com")
  ) {
    return; // Let browser handle — no caching
  }

  // For same-origin requests: stale-while-revalidate
  if (url.origin === location.origin) {
    e.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(e.request);
        const fetchPromise = fetch(e.request)
          .then((res) => {
            if (res && res.status === 200) {
              cache.put(e.request, res.clone());
            }
            return res;
          })
          .catch(() => cached); // offline fallback
        return cached || fetchPromise;
      })
    );
    return;
  }

  // External requests (fonts, CDN) — network with cache fallback
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// ── Push notifications (future use) ──────────────────────────
self.addEventListener("push", (e) => {
  if (!e.data) return;
  const data = e.data.json();
  self.registration.showNotification(data.title || "SAVY", {
    body:    data.body  || "Votre commande est en route 🛵",
    icon:    "/images/icon-192.png",
    badge:   "/images/icon-192.png",
    vibrate: [200, 100, 200],
    data:    { url: data.url || "/" },
  });
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url || "/"));
});
