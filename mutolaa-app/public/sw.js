// Sahifa service worker.
// - Sahifalar (HTML) internetdan olinadi va keshlanmaydi — ular shaxsiy (javon, qaydlar).
// - Internet boʻlmasa har qanday sahifa oflayn javonga (/oflayn) yoʻnaltiriladi. U cookie'siz olingan statik sahifa:
//   maʼlumotni telefondagi IndexedDB'dan oʻqiydi (lib/offline-store.ts). Sahifa va uning fayllari alohida keshda
//   (SHELL) — u tozalanmaydi va sayt yangilanganda fon sinxronlash xabari bilan yangilanadi.
// - /_next/static (hash'li, oʻzgarmas) va /icons — cache-first.
// Oʻzgartirsangiz VERSION'ni oshiring: eski keshlar oʻchiriladi.
const VERSION = "v2";
const STATIC = `sahifa-static-${VERSION}`;
const SHELL = `sahifa-shell-${VERSION}`;
const SHELL_URL = "/oflayn";
const META_URL = "/__sahifa-shell-meta";
const SHELL_REFRESH_MS = 6 * 60 * 60 * 1000;
const MAX_STATIC = 300;

// Oflayn javon sahifasi va u ishlashi uchun kerak boʻlgan fayllar (JS, CSS, shriftlar).
// Avval fayllar, keyin sahifa yoziladi; bittasi ham olinmasa — eski nusxa qoladi.
async function cacheShell() {
  const res = await fetch(new Request(SHELL_URL, { credentials: "omit", cache: "reload" }));
  if (!res.ok) throw new Error(`oflayn javon: ${res.status}`);
  const html = await res.clone().text();
  const assets = new Set(["/icons/icon-192.png"]);
  for (const m of html.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\s)\\]+?\.(?:js|css|woff2)/g)) {
    assets.add(m[0].startsWith("/_next/") ? m[0] : `/_next/${m[0]}`);
  }
  // CSS ichidagi shriftlar
  for (const css of [...assets].filter((a) => a.endsWith(".css"))) {
    const text = await (await fetch(css)).text();
    for (const m of text.matchAll(/\/_next\/static\/media\/[^"'\s)]+/g)) assets.add(m[0]);
  }
  const cache = await caches.open(SHELL);
  await cache.addAll([...assets]);
  await cache.put(SHELL_URL, res);
  await cache.put(META_URL, new Response(String(Date.now())));
  // endi kerak boʻlmagan eski fayllar
  const keep = new Set([...assets, SHELL_URL, META_URL].map((p) => new URL(p, self.location.origin).href));
  for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
}

async function refreshShellIfStale() {
  const cache = await caches.open(SHELL);
  const meta = await cache.match(META_URL);
  const at = meta ? Number(await meta.text()) : 0;
  if (Date.now() - at > SHELL_REFRESH_MS) await cacheShell();
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [STATIC, SHELL];
      for (const key of await caches.keys()) if (key.startsWith("sahifa-") && !keep.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// Fon sinxronlash (components/offline/offline-sync.tsx) internet borligida yuboradi
self.addEventListener("message", (event) => {
  if (event.data?.type === "sahifa:refresh-offline") event.waitUntil(refreshShellIfStale().catch(() => {}));
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
    event.respondWith(
      fetch(request).catch(async () => {
        if (url.pathname === SHELL_URL) return (await caches.match(SHELL_URL, { cacheName: SHELL })) ?? Response.error();
        // har qanday sahifa internetsiz — oflayn javonga
        return (await caches.match(SHELL_URL, { cacheName: SHELL })) ? Response.redirect(SHELL_URL, 302) : Response.error();
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) {
          const cache = await caches.open(STATIC);
          await cache.put(request, res.clone());
          event.waitUntil(trim(cache));
        }
        return res;
      })(),
    );
  }
});
