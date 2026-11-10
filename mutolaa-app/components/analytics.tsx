"use client";

import { useParams, usePathname } from "next/navigation";
import { useEffect } from "react";

// Vercel Web Analytics — tashriflar soni (cookie qoʻymaydi, odamni tanimaydi). Vercel'da loyiha sozlamalaridan
// yoqilgan boʻlishi kerak (Analytics → Enable), aks holda skript 404 qaytaradi va hech narsa yuborilmaydi.
// @vercel/analytics paketining Next.js qismi bajaradigan ishning oʻzi: paket npm'da vitest'ning vite versiyasi
// bilan ziddiyat bergani uchun qoʻlda ulangan.

type VaEvent = { type: "pageview" | "event"; url: string };
type Va = {
  (event: "beforeSend", fn: (e: VaEvent) => VaEvent | null): void;
  (event: "pageview", props: { route: string; path: string }): void;
};
declare global {
  interface Window {
    va?: Va;
    vaq?: unknown[][];
  }
}

const SRC = "/_vercel/insights/script.js";

// Klub taklif havolasidagi maxfiy kod statistikaga tushmasin
const safePath = (path: string) => path.replace(/^\/klublar\/taklif\/.+/, "/klublar/taklif/[code]");

// /kitob/otkan-kunlar → /kitob/[slug]: hisobotda sahifalar turi boʻyicha ham guruhlanadi
function routeOf(path: string, params: Record<string, string | string[] | undefined>) {
  const names = Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string");
  return path
    .split("/")
    .map((segment) => {
      const match = names.find(([, value]) => value === segment);
      return match ? `[${match[0]}]` : segment;
    })
    .join("/");
}

export function Analytics() {
  const path = usePathname();
  const params = useParams();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    window.va ??= ((...args: unknown[]) => void (window.vaq ??= []).push(args)) as Va;
    // Manzildagi soʻrov qismi (?code=…, ?next=…) yuborilmaydi — faqat sahifa yoʻli
    window.va("beforeSend", (e) => {
      const url = new URL(e.url, window.location.origin);
      return { ...e, url: url.origin + safePath(url.pathname) };
    });
    if (document.head.querySelector(`script[src="${SRC}"]`)) return;
    const script = document.createElement("script");
    script.src = SRC;
    script.defer = true;
    // sahifa koʻrishlarini oʻzimiz yuboramiz (pastda) — skript ikki marta sanamasin
    script.dataset.disableAutoTrack = "1";
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    window.va?.("pageview", { route: safePath(routeOf(path, params)), path: safePath(path) });
  }, [path, params]);

  return null;
}
