"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { uz } from "@/lib/i18n/uz";

const PAGE = "/bildirishnomalar";
// Roʻyxat sahifasi hammasini oʻqilgan deb belgilagach shu hodisani yuboradi (app/bildirishnomalar/mark-read.tsx)
export const NOTIFICATIONS_READ_EVENT = "xatchop:notifications-read";
const MIN_GAP_MS = 30_000;

// Sarlavhadagi qoʻngʻiroqcha. Sarlavha sahifalar almashganda serverda qayta chizilmaydi, shuning uchun son
// brauzerda yangilanadi: boshqa sahifaga oʻtilganda va oynaga qaytilganda (30 soniyada koʻpi bilan bir marta).
export function NotificationBell({ initialCount }: { initialCount: number }) {
  const pathname = usePathname();
  const [count, setCount] = useState(initialCount);
  const lastLoad = useRef<number | null>(null);

  useEffect(() => {
    const load = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      // birinchi son serverdan hozirgina keldi
      if (lastLoad.current === null) lastLoad.current = now;
      else if (now - lastLoad.current >= MIN_GAP_MS) {
        lastLoad.current = now;
        fetch("/api/bildirishnomalar", { cache: "no-store" })
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { count?: unknown } | null) => {
            if (typeof data?.count === "number") setCount(data.count);
          })
          .catch(() => {
            // internet yoʻq — eski son qoladi
          });
      }
    };
    const onRead = () => setCount(0);
    load();
    document.addEventListener("visibilitychange", load);
    window.addEventListener(NOTIFICATIONS_READ_EVENT, onRead);
    return () => {
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, onRead);
    };
  }, [pathname]);

  // roʻyxat ochiq turganda nishon koʻrsatilmaydi — hammasi koʻz oldida
  const shown = pathname === PAGE ? 0 : count;
  const label = shown > 0 ? uz.notifications.bellUnread(shown) : uz.notifications.title;
  return (
    <Link
      href={PAGE}
      aria-label={label}
      title={label}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" strokeLinejoin="round" />
        <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
      </svg>
      {shown > 0 && (
        <span className="absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-fg">
          {shown > 9 ? "9+" : shown}
        </span>
      )}
    </Link>
  );
}
