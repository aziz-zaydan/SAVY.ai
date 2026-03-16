// SAVY Dashboard Service Worker — v1.0
const CACHE = "savy-dash-v1";
const SHELL = ["/dashboard.html", "/dashboard-manifest.json", "/images/icon-192.png", "/images/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  // Never cache Google Apps Script calls
  if(e.request.url.includes("script.google.com")) return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);
      const fresh  = fetch(e.request).then(res => {
        if(res && res.status === 200) cache.put(e.request, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
