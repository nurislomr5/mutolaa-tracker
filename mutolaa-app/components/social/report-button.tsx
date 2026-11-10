"use client";

import { useActionState, useState } from "react";
import { reportContent } from "@/app/actions/reports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/i18n/uz";

const REASONS = ["spam", "abuse", "inappropriate", "other"] as const;

// "⚑ Shikoyat" — taqriz, klubdagi xabar yoki profil ustidan. Faqat tizimga kirgan va muallif boʻlmagan odamga
// koʻrsatiladi (tekshiruv serverda ham bor). Ota element `flex flex-wrap` boʻlishi kerak: forma alohida qatorga tushadi.
export function ReportButton({ type, id, label }: { type: "review" | "club_post" | "profile"; id: number | string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(reportContent, null);
  const t = uz.report;

  if (state?.ok) {
    return (
      <p role="status" className="basis-full text-xs text-accent">
        {state.message}
      </p>
    );
  }

  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="text-xs text-muted hover:text-danger hover:underline">
        ⚑ {label ?? t.button}
      </button>
      {open && (
        <form action={action} className="flex basis-full flex-wrap items-center gap-2">
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="id" value={id} />
          <select name="reason" required defaultValue="" aria-label={t.reasonLabel} className="h-9 rounded-lg border border-border bg-surface px-2 text-xs">
            <option value="" disabled>
              {t.reasonLabel}…
            </option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {t.reasons[r]}
              </option>
            ))}
          </select>
          <Input name="message" maxLength={500} placeholder={t.messagePlaceholder} aria-label={t.messagePlaceholder} className="h-9 min-w-40 flex-1 text-xs" />
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            {t.send}
          </Button>
          {state && !state.ok && <p className="w-full text-xs text-danger">{state.error}</p>}
        </form>
      )}
    </>
  );
}
