"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteAccount } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";
import { clearOffline, offlineSupported } from "@/lib/offline-store";

// Shu qurilmadagi shaxsiy izlar: oflayn javon nusxasi va oʻqish taymerlari
async function clearDevice() {
  try {
    if (offlineSupported()) await clearOffline();
  } catch {
    // brauzer xotirasi yopiq boʻlsa — oʻtkazib yuboramiz
  }
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith("sahifa:timer:")) localStorage.removeItem(key);
  } catch {
    // ignore localStorage errors
  }
}

export function DeleteAccount() {
  const t = uz.account;
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-muted hover:text-danger">
        {t.deleteOpen}
      </button>
    );
  }

  function submit(formData: FormData) {
    start(async () => {
      const result = await deleteAccount(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await clearDevice();
      // toʻliq qayta yuklash: sarlavha va keshdagi sahifalar ham mehmon holatiga oʻtsin
      window.location.replace("/");
    });
  }

  return (
    <form action={submit} className="space-y-3 rounded-xl border border-danger/40 bg-danger-soft/40 p-4 text-sm">
      <p className="font-medium text-danger">{t.deleteTitle}</p>
      <p>{t.deleteIntro}</p>
      <ul className="list-disc space-y-1 pl-5">
        {t.deleteList.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="text-muted">{t.deleteKeep}</p>
      <p className="text-muted">
        {t.deleteExport}{" "}
        <Link href="/javonim" className="font-medium text-accent hover:underline">
          {t.exportShelf}
        </Link>
        {", "}
        <Link href="/qaydlar" className="font-medium text-accent hover:underline">
          {t.exportNotes}
        </Link>
      </p>
      <label className="flex items-start gap-3 font-medium">
        <input
          type="checkbox"
          name="confirm"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--danger)]"
        />
        {t.confirmLabel}
      </label>
      {error && <p className="text-danger">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={!confirmed || pending}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-danger bg-surface px-4 text-sm font-medium text-danger transition-colors hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? t.deleting : t.deleteButton}
        </button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setConfirmed(false);
            setError(null);
          }}
        >
          {uz.common.cancel}
        </Button>
      </div>
    </form>
  );
}
