"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { dismissDuplicate, mergeBooks, type AdminResult } from "@/app/actions/admin-books";
import { BookCover } from "@/components/book/book-cover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DuplicatePair, MergeBook } from "@/lib/admin-books";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = { mutolaa: "Mutolaa", asaxiy: "Asaxiy", hilol: "Hilol", user: "Foydalanuvchi" };

function BookSide({ book, other, suggested, pending, onKeep }: { book: MergeBook; other: MergeBook; suggested: boolean; pending: boolean; onKeep: () => void }) {
  const t = uz.admin;
  // Mutolaa kitobi boshqasiga qoʻshilmaydi (importer uni slug boʻyicha qayta yaratadi)
  const locked = other.source === "mutolaa" && book.source !== "mutolaa";
  return (
    <div className={cn("flex gap-3 rounded-xl border p-3", suggested ? "border-accent bg-accent/5" : "border-border")}>
      <Link href={`/kitob/${book.slug}`} target="_blank" className="w-20 shrink-0">
        <BookCover src={book.cover_url} title={book.title} sizes="80px" />
      </Link>
      <div className="min-w-0 flex-1 text-sm">
        <Link href={`/kitob/${book.slug}`} target="_blank" className="font-semibold hover:text-accent">
          {book.title}
        </Link>
        {book.author_names && <p className="text-muted">{book.author_names}</p>}
        <p className="mt-1 text-xs text-muted">
          {[book.publisher, book.published_year, book.page_count && `${book.page_count} bet`, book.isbn && `ISBN ${book.isbn}`].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {[...new Set([book.source, ...book.sources])].map((s) => (
            <Badge key={s} tone={s === "mutolaa" ? "accent" : "neutral"}>
              {SOURCE_LABEL[s] ?? s}
            </Badge>
          ))}
          <Badge>{t.readers(book.readers)}</Badge>
          <span className="text-xs text-muted">#{book.id}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button type="button" size="sm" variant={suggested ? "primary" : "secondary"} disabled={pending || locked} onClick={onKeep}>
            {t.keepThis}
          </Button>
          {suggested && <span className="text-xs text-accent">{t.suggested}</span>}
          {locked && <span className="text-xs text-muted">{t.mutolaaLocked}</span>}
        </div>
      </div>
    </div>
  );
}

export function PairCard({ pair }: { pair: DuplicatePair }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const { a, b } = pair;
  const t = uz.admin;

  const keep = (target: MergeBook, source: MergeBook) => {
    if (!window.confirm(t.confirm(target.title, source.title))) return;
    start(async () => setResult(await mergeBooks(target.id, source.id)));
  };

  if (result?.ok) return <li className="rounded-xl border border-border bg-surface p-4 text-sm text-accent">{result.message}</li>;

  return (
    <li className={cn("rounded-2xl border border-border bg-surface p-4", pending && "opacity-60")}>
      <div className="mb-3 flex items-center justify-between gap-2 text-xs">
        <Badge tone="warning">{t.reason[pair.reason] ?? pair.reason}</Badge>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => setResult(await dismissDuplicate(a.id, b.id)))}
          className="text-muted hover:text-text hover:underline"
        >
          {t.notDuplicate}
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <BookSide book={a} other={b} suggested={pair.suggestedTarget === a.id} pending={pending} onKeep={() => keep(a, b)} />
        <BookSide book={b} other={a} suggested={pair.suggestedTarget === b.id} pending={pending} onKeep={() => keep(b, a)} />
      </div>
      {result && !result.ok && <p className="mt-2 text-sm text-danger">{result.error}</p>}
    </li>
  );
}
