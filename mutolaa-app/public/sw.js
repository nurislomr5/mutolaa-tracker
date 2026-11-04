// Sahifa service worker. Ataylab sodda:
// - sahifalar (HTML) keshlanmaydi — ular shaxsiy (javon, qaydlar); internet boʻlmasa /offline koʻrsatiladi
// - /_next/static (hash'li, oʻzgarmas) va /icons — cache-first
// Oʻzgartirsangiz VERSION'ni oshiring: eski keshlar oʻchiriladi.
const VERSION = "v1";
const STATIC = `sahifa-static-${VERSION}`;
const OFFLINE = `sahifa-offline-${VERSION}`;
const OFFLINE_URL = "/offline";
const MAX_STATIC = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // cookie'siz — oflayn sahifaga foydalanuvchi maʼlumoti tushmasin
      const res = await fetch(new Request(OFFLINE_URL, { credentials: "omit", cache: "reload" }));
      if (!res.ok) throw new Error(`offline: ${res.status}`);
      const html = await res.clone().text();
      await (await caches.open(OFFLINE)).put(OFFLINE_URL, res);
      // oflayn sahifa oʻz stillari bilan koʻrinishi uchun
      const css = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+\.css/g) ?? [])];
      await (await caches.open(STATIC)).addAll([...css, "/icons/icon-192.png"]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [STATIC, OFFLINE];
      for (const key of await caches.keys()) if (key.startsWith("sahifa-") && !keep.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_STATIC))) await cache.delete(key);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE_URL, { cacheName: OFFLINE })) ?? Response.error()));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) {
          await cache.put(request, res.clone());
          event.waitUntil(trim(cache));
        }
        return res;
      })(),
    );
  }
});
