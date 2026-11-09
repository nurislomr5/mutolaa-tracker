"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { OfflineSnapshot } from "@/lib/offline";
import { clearOffline, getSnapshot, listOps, offlineSupported, removeOps, saveSnapshot } from "@/lib/offline-store";

// Fon sinxronlash (butun saytda): internet bor paytda navbatdagi amallarni yuboradi va javon nusxasini yangilaydi.
// signedIn — server bergan maslahat (kirgan boʻlsa sinxronlaymiz). Chiqqanini faqat server javobi (401) tasdiqlaydi:
// oflayn keshdagi sahifada signedIn=false boʻlishi mumkin — u nusxani oʻchirib yubormasligi kerak.

export const OFFLINE_SYNC_EVENT = "sahifa:offline-sync";

let running = false;

async function syncOnce(signedIn: boolean): Promise<"synced" | "signed-out" | "skipped" | "error"> {
  if (running || !navigator.onLine) return "skipped";
  running = true;
  try {
    const [snapshot, ops] = await Promise.all([getSnapshot(), listOps()]);
    if (!signedIn && !snapshot && !ops.length) return "skipped"; // mehmon — hech narsa saqlanmagan

    const res = ops.length
      ? await fetch("/api/offline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ops: ops.map(({ createdAt, ...op }) => (void createdAt, op)) }),
        })
      : await fetch("/api/offline", { cache: "no-store" });

    if (res.status === 401) {
      // Saytdan chiqilgan: boshqa odam shu telefonda ochsa ham shaxsiy maʼlumot koʻrinmasin
      await clearOffline();
      return "signed-out";
    }
    if (res.status === 400) {
      // Buzilgan navbat (masalan, eski format) — cheksiz takrorlanmasin
      await removeOps(ops.map((o) => o.id));
      return "error";
    }
    if (!res.ok) return "error";

    const data = (await res.json()) as OfflineSnapshot | { results: { id: string; ok: boolean }[]; snapshot: OfflineSnapshot };
    const next = "snapshot" in data ? data.snapshot : data;
    if (snapshot && snapshot.userId !== next.userId) await clearOffline(); // boshqa hisob
    // Server qayta ishlagan amallar navbatdan olinadi (rad etilganlari ham — ular takrorlansa ham oʻtmaydi)
    if ("results" in data) await removeOps(data.results.map((r) => r.id));
    await saveSnapshot(next);
    return "synced";
  } catch {
    return "error"; // tarmoq — navbat telefonda qoladi
  } finally {
    running = false;
  }
}

// Service worker oflayn javon sahifasini (va uning fayllarini) yangilab qoʻysin — yangi versiya chiqqanda ham ishlasin
function refreshOfflineShell() {
  navigator.serviceWorker?.controller?.postMessage({ type: "sahifa:refresh-offline" });
}

export function OfflineSync({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!offlineSupported()) return;
    const run = async () => {
      const before = (await listOps().catch(() => [])).length;
      const result = await syncOnce(signedIn);
      if (result === "synced") {
        refreshOfflineShell();
        // oflayn yozilgan progress sahifada ham koʻrinsin
        if (before) router.refresh();
      }
    };
    const onVisible = () => document.visibilityState === "visible" && run();
    run();
    window.addEventListener("online", run);
    window.addEventListener(OFFLINE_SYNC_EVENT, run);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(run, 10 * 60_000);
    return () => {
      window.removeEventListener("online", run);
      window.removeEventListener(OFFLINE_SYNC_EVENT, run);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [signedIn, router]);

  return null;
}

export { syncOnce as _syncOnceForTests };
