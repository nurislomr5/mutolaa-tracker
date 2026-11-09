"use client";

import { useOffline } from "next/offline";
import { useEffect } from "react";
import { uz } from "@/lib/i18n/uz";
import "@/lib/pwa-client";

// Service worker'ni roʻyxatdan oʻtkazadi (faqat production) va internet uzilganda pastki banner koʻrsatadi
export function PwaSetup() {
  const offline = useOffline();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);

  if (!offline) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 bg-warning-soft md:bottom-0 px-4 py-2.5 text-center text-sm text-warning shadow">
      {uz.pwa.offlineBanner}
    </div>
  );
}
