"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef } from "react";
import { addBook, type AddBookState } from "@/app/actions/add-book";
import { BookCover } from "@/components/book/book-cover";
import { FormatIcon } from "@/components/book/format-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/i18n/uz";
import { STATUSES } from "@/lib/shelf-types";

const label = "block text-sm font-medium";
const hint = "mt-1 block text-xs font-normal text-muted";

export function AddBookForm({ initialTitle, publishers }: { initialTitle: string; publishers: string[] }) {
  const t = uz.addBook;
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<AddBookState, FormData>(addBook, null);

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <label className={label}>
        {t.bookTitle}
        <Input name="title" required maxLength={200} defaultValue={initialTitle} className="mt-1" autoFocus={!initialTitle} />
      </label>
      <label className={label}>
        {t.authors}
        <Input name="authors" required maxLength={300} className="mt-1" />
        <span className={hint}>{t.authorsHint}</span>
      </label>

      <fieldset>
        <legend className={label}>{t.formats}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["paper", "ebook", "audio"] as const).map((f) => (
            <label key={f} className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input type="checkbox" name="formats" value={f} defaultChecked={f === "paper"} className="accent-[var(--accent)]" />
              <FormatIcon format={f} className="h-4 w-4" />
              {uz.format[f]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>
          {t.pageCount}
          <Input name="page_count" type="number" min={1} max={10000} inputMode="numeric" className="mt-1" />
        </label>
        <label className={label}>
          {t.year}
          <Input name="year" type="number" min={1500} max={new Date().getFullYear() + 1} inputMode="numeric" className="mt-1" />
        </label>
        <label className={label}>
          {t.isbn}
          <Input name="isbn" maxLength={20} placeholder="978-…" className="mt-1" />
        </label>
      </div>

      <label className={label}>
        {t.publisher} <span className="font-normal text-muted">({t.optional})</span>
        <Input name="publisher" list="publishers" maxLength={120} className="mt-1" />
        <datalist id="publishers">
          {publishers.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>

      <label className={label}>
        {t.coverUrl}
        <Input name="cover_url" type="url" maxLength={500} placeholder="https://" className="mt-1" />
        <span className={hint}>{t.coverHint}</span>
      </label>

      <label className={label}>
        {t.description}
        <textarea
          name="description"
          rows={3}
          maxLength={3000}
          className="mt-1 w-full rounded-lg border border-border bg-surface p-3 text-sm focus-visible:outline-2 focus-visible:outline-accent"
        />
      </label>

      <label className={label}>
        {t.status}
        <select name="status" defaultValue="reading" className="mt-1 block h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm sm:w-60">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {uz.status[s]}
            </option>
          ))}
        </select>
      </label>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      {state?.duplicates && (
        <div className="rounded-xl border border-warning/40 bg-warning-soft p-4">
          <p className="font-medium">{t.duplicatesTitle}</p>
          <p className="mt-1 text-sm text-muted">{t.duplicatesHint}</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {state.duplicates.map((b) => (
              <li key={b.slug}>
                <Link href={`/kitob/${b.slug}`} className="flex gap-3 rounded-lg bg-surface p-2 hover:bg-surface-2">
                  <BookCover src={b.cover_url} title={b.title} sizes="40px" className="w-10 shrink-0" />
                  <span className="min-w-0 text-sm">
                    <span className="line-clamp-2 font-medium">{b.title}</span>
                    <span className="line-clamp-1 text-muted">{b.author_names}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            className="mt-4"
            disabled={pending}
            onClick={() => {
              const fd = new FormData(formRef.current!);
              fd.set("force", "1");
              startTransition(() => action(fd));
            }}
          >
            {t.addAnyway}
          </Button>
        </div>
      )}

      {!state?.duplicates && (
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t.submitting : t.submit}
        </Button>
      )}
    </form>
  );
}
