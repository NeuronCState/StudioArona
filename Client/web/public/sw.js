/**
 * Studio Arona Service Worker — offline cache for production builds.
 *
 * Strategy: Cache-First for static assets (JS/CSS/fonts), Network-First for API.
 * On install, pre-caches the app shell (index.html + critical JS/CSS chunks).
 */
const CACHE_NAME = "arona-v3-" + (self as any).VERSION || "1";
const SHELL_ASSETS = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch(() => {});
    }),
  );
  (self as any).skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
    }),
  );
  (self as any).clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API / health checks: network-only
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/health")) {
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok && event.request.method === "GET") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
      );
    }),
  );
});
