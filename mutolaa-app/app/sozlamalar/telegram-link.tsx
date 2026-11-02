"use client";

import { useState, useTransition } from "react";
import { createTelegramLink, unlinkTelegram, type LinkResult } from "@/app/actions/telegram";
import { Button, buttonClasses } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";

export function TelegramLink({ linked }: { linked: boolean }) {
  const t = uz.settings;
  const [pending, start] = useTransition();
  const [result, setResult] = useState<LinkResult | null>(null);

  if (linked) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-accent">{t.telegramLinked}</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm(t.telegramUnlinkConfirm)) start(() => unlinkTelegram());
          }}
          className="text-sm text-muted hover:text-danger"
        >
          {t.telegramUnlink}
        </button>
      </div>
    );
  }

  if (result?.ok) {
    return (
      <div className="space-y-2">
        <a href={result.url} target="_blank" rel="noreferrer" className={buttonClasses()}>
          {t.telegramLinkOpen} ↗
        </a>
        <p className="text-xs text-muted">{t.telegramLinkHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button disabled={pending} onClick={() => start(async () => setResult(await createTelegramLink()))}>
        {t.telegramLink}
      </Button>
      {result && !result.ok && <p className="text-sm text-danger">{result.error}</p>}
    </div>
  );
}
