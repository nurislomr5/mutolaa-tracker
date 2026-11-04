"use client";

import { Button } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";
import { dismissBanner, promptInstall, useBannerDismissed, useCanPrompt, usePlatform } from "@/lib/pwa-client";

// Sozlamalardagi "Ilova" kartasi: platformaga qarab tugma yoki koʻrsatma
export function InstallAppCard() {
  const t = uz.pwa;
  const platform = usePlatform();
  const canPrompt = useCanPrompt();
  if (platform === "unknown") return null;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">{t.intro}</p>
      {platform === "standalone" ? (
        <p>{t.installed}</p>
      ) : platform === "telegram" ? (
        <p>{t.telegram}</p>
      ) : canPrompt ? (
        <Button onClick={promptInstall}>{t.install}</Button>
      ) : (
        <p>{platform === "ios" ? t.ios : t.other}</p>
      )}
    </div>
  );
}

// Javon sahifasidagi yopiladigan taklif — faqat oʻrnatish mumkin boʻlganda (Android tugmasi yoki iOS Safari)
export function InstallBanner() {
  const t = uz.pwa;
  const platform = usePlatform();
  const canPrompt = useCanPrompt();
  const dismissed = useBannerDismissed();
  if (dismissed || !(canPrompt || platform === "ios")) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-border bg-accent-soft p-4 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t.bannerTitle}</p>
        <p className="mt-1 text-muted">{canPrompt ? t.bannerBody : t.ios}</p>
        {canPrompt && (
          <Button size="sm" className="mt-3" onClick={promptInstall}>
            {t.install}
          </Button>
        )}
      </div>
      <button type="button" onClick={dismissBanner} aria-label={t.dismiss} className="rounded-lg px-2 py-1 text-muted hover:bg-surface-2">
        ✕
      </button>
    </div>
  );
}
