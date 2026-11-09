"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

// Telefon / Telegram Mini App uchun pastki menyu (md dan katta ekranda yashiriladi — u yerda sarlavhadagi menyu).
// BottomNavShell hook'siz (usePathname'siz) — Suspense fallback sifatida ham ishlatiladi.

type Tab = { href: string; label: string; icon: React.ReactNode; match: (p: string) => boolean };

const svg = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

const ICONS = {
  catalog: svg(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>,
  ),
  shelf: svg(
    <>
      <path d="M5 4h3v16H5zM10 4h3v16h-3z" />
      <path d="m15.5 5 3-.8 3.6 15-3 .8z" />
    </>,
  ),
  feed: svg(
    <>
      <path d="M4 5h16M4 12h16M4 19h10" />
    </>,
  ),
  profile: svg(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
    </>,
  ),
  plus: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
};

function tabs(profileHref: string): { left: Tab[]; right: Tab[] } {
  return {
    left: [
      { href: "/kitoblar", label: uz.nav.catalog, icon: ICONS.catalog, match: (p) => p.startsWith("/kitob") && !p.startsWith("/kitob-qoshish") },
      { href: "/javonim", label: uz.nav.shelves, icon: ICONS.shelf, match: (p) => p.startsWith("/javonim") },
    ],
    right: [
      { href: "/lenta", label: uz.nav.feed, icon: ICONS.feed, match: (p) => p.startsWith("/lenta") },
      {
        href: profileHref,
        label: uz.nav.profile,
        icon: ICONS.profile,
        match: (p) => p.startsWith("/sozlamalar") || p.startsWith("/statistika") || (profileHref.startsWith("/u/") && p === profileHref),
      },
    ],
  };
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
        active ? "text-accent" : "text-muted hover:text-text",
      )}
    >
      {tab.icon}
      {tab.label}
    </Link>
  );
}

export function BottomNavShell({ pathname, profileHref }: { pathname: string | null; profileHref: string }) {
  const [addOpen, setAddOpen] = useState(false);
  const { left, right } = tabs(profileHref);
  const addActive = pathname?.startsWith("/kitob-qoshish") || pathname?.startsWith("/skaner");

  const close = () => setAddOpen(false);

  // Esc bosilsa "+" menyusi yopiladi (havola bosilganda — onClick orqali)
  useEffect(() => {
    if (!addOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAddOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen]);

  return (
    <>
      {addOpen && <button type="button" aria-label={uz.nav.closeMenu} className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={close} />}
      <nav
        aria-label={uz.nav.bottomNav}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {addOpen && (
          <div id="bottom-nav-add" className="absolute inset-x-4 bottom-full mb-3 overflow-hidden rounded-2xl border border-border bg-surface shadow-lg">
            <Link href="/skaner" onClick={close} className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium hover:bg-surface-2">
              <span aria-hidden>📷</span>
              <span>
                {uz.nav.addScan}
                <span className="block text-xs font-normal text-muted">{uz.nav.addScanHint}</span>
              </span>
            </Link>
            <Link href="/kitoblar" onClick={close} className="flex items-center gap-3 border-t border-border px-4 py-3.5 text-sm font-medium hover:bg-surface-2">
              <span aria-hidden>🔎</span>
              <span>
                {uz.nav.addSearch}
                <span className="block text-xs font-normal text-muted">{uz.nav.addSearchHint}</span>
              </span>
            </Link>
            <Link href="/kitob-qoshish" onClick={close} className="flex items-center gap-3 border-t border-border px-4 py-3.5 text-sm font-medium hover:bg-surface-2">
              <span aria-hidden>✍️</span>
              <span>
                {uz.nav.addNew}
                <span className="block text-xs font-normal text-muted">{uz.nav.addNewHint}</span>
              </span>
            </Link>
          </div>
        )}
        <div className="flex h-16 items-stretch">
          {left.map((t) => (
            <TabLink key={t.label} tab={t} active={Boolean(pathname && t.match(pathname))} />
          ))}
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              aria-expanded={addOpen}
              aria-controls="bottom-nav-add"
              aria-label={uz.nav.add}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-fg shadow-md transition-transform active:scale-95",
                (addOpen || addActive) && "ring-4 ring-accent/25",
                addOpen && "rotate-45",
              )}
            >
              {ICONS.plus}
            </button>
          </div>
          {right.map((t) => (
            <TabLink key={t.label} tab={t} active={Boolean(pathname && t.match(pathname))} />
          ))}
        </div>
      </nav>
    </>
  );
}

// Faol tab — joriy manzil boʻyicha (usePathname dinamik sahifalarda prerender paytida kutadi, shuning uchun Suspense ichida)
export function BottomNavBar({ profileHref }: { profileHref: string }) {
  return <BottomNavShell pathname={usePathname()} profileHref={profileHref} />;
}
