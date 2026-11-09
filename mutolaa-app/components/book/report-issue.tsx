"use client";

import { useActionState, useState } from "react";
import { reportBookIssue } from "@/app/actions/report-book";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/i18n/uz";

export function ReportBookIssue({ slug, title }: { slug: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(reportBookIssue, null);
  const t = uz.book;

  if (state?.ok) {
    return <p className="mt-4 text-xs text-accent">{state.message}</p>;
  }

  return (
    <div className="mt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs text-muted hover:text-accent hover:underline">
        ⚑ {t.reportIssue}
      </button>
      {open && (
        <form action={action} className="mt-2 flex flex-wrap gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="title" value={title} />
          <Input
            name="message"
            required
            minLength={3}
            maxLength={1000}
            placeholder={t.reportPlaceholder}
            aria-label={t.reportIssue}
            className="h-9 flex-1 text-xs sm:max-w-md"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            {t.reportSend}
          </Button>
          {state && !state.ok && <p className="w-full text-xs text-danger">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
