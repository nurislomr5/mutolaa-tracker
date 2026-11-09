"use client";

import { useOffline } from "next/offline";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/i18n/uz";
import type { OfflineBook } from "@/lib/offline";
import { addOp, getOfflineState, getServerOfflineState, newOpId, subscribeOffline } from "@/lib/offline-store";
import { NOTE_TYPES, todayInTashkent, type NoteType } from "@/lib/shelf-types";
import { cn } from "@/lib/utils";
import { OFFLINE_SYNC_EVENT } from "./offline-sync";

// /oflayn: telefonda saqlangan javon nusxasi. Internet boʻlmasa ham progress va qaydlar navbatga yoziladi.
// Sahifa serverdan maʼlumot olmaydi — service worker uni internetsiz ham ochadi (public/sw.js).

const t = uz.offline;

function useNavigatorOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

const requestSync = () => window.dispatchEvent(new Event(OFFLINE_SYNC_EVENT));

function formatProgress(b: OfflineBook) {
  const unit = t.unit[b.unit];
  if (b.unit === "percent") return `${b.current}%`;
  return b.total ? `${b.current} / ${b.total} ${unit}` : `${b.current} ${unit}`;
}

function Cover({ book }: { book: OfflineBook }) {
  const [failed, setFailed] = useState(false);
  if (!book.cover || failed) {
    return (
      <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md bg-accent-soft font-serif text-lg text-accent" aria-hidden>
        {book.title.charAt(0)}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- internetsiz next/image optimallashtiruvchisi ishlamaydi
  return <img src={book.cover} alt="" onError={() => setFailed(true)} className="h-20 w-14 shrink-0 rounded-md object-cover" />;
}

function ProgressEditor({ book, onDone }: { book: OfflineBook; onDone: () => void }) {
  const percent = book.unit === "percent";
  const [current, setCurrent] = useState(String(book.current));
  const [total, setTotal] = useState(String(book.total ?? ""));
  const [date, setDate] = useState(todayInTashkent());
  const totalNum = percent ? 100 : Number(total);
  const currentNum = Number(current);
  const valid = Number.isInteger(currentNum) && currentNum >= 0 && Number.isInteger(totalNum) && totalNum > 0 && date <= todayInTashkent();

  return (
    <form
      className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        await addOp({
          id: newOpId(),
          kind: "progress",
          userBookId: book.id,
          format: book.format ?? (book.unit === "minutes" ? "audio" : book.unit === "percent" ? "ebook" : "paper"),
          unit: book.unit,
          current: Math.min(currentNum, totalNum),
          total: totalNum,
          date,
        });
        requestSync();
        onDone();
      }}
    >
      <label className="text-xs text-muted">
        {t.current} ({t.unit[book.unit]})
        <Input type="number" inputMode="numeric" min={0} value={current} onChange={(e) => setCurrent(e.target.value)} className="mt-1 h-10" autoFocus />
      </label>
      {!percent && (
        <label className="text-xs text-muted">
          {t.total}
          <Input type="number" inputMode="numeric" min={1} value={total} onChange={(e) => setTotal(e.target.value)} className="mt-1 h-10" />
        </label>
      )}
      <label className="text-xs text-muted">
        {t.date}
        <Input type="date" max={todayInTashkent()} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-10" />
      </label>
      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" disabled={!valid}>
          {t.save}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}

function NoteEditor({ book, onDone }: { book: OfflineBook; onDone: () => void }) {
  const [type, setType] = useState<NoteType>("iqtibos");
  const [reference, setReference] = useState("");
  const [content, setContent] = useState("");
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!content.trim()) return;
        await addOp({ id: newOpId(), kind: "note", userBookId: book.id, type, reference: reference.trim(), content: content.trim() });
        requestSync();
        onDone();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as NoteType)}
          aria-label={t.noteType}
          className="h-10 rounded-lg border border-border bg-surface px-2 text-sm"
        >
          {NOTE_TYPES.map((nt) => (
            <option key={nt} value={nt}>
              {uz.noteType[nt]}
            </option>
          ))}
        </select>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} placeholder={t.reference} className="h-10 flex-1" />
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={5000}
        rows={3}
        placeholder={t.noteText}
        aria-label={t.noteText}
        className="w-full rounded-lg border border-border bg-surface p-3 text-sm placeholder:text-muted"
        autoFocus
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!content.trim()}>
          {t.save}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}

function ReadingCard({ book, onSaved }: { book: OfflineBook; onSaved: () => void }) {
  const [editing, setEditing] = useState<"progress" | "note" | null>(null);
  const pct = book.unit === "percent" ? book.current : book.total ? Math.round((book.current / book.total) * 100) : null;
  const done = () => {
    setEditing(null);
    onSaved();
  };
  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex gap-3">
        <Cover book={book} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{book.title}</p>
          {book.authors && <p className="truncate text-sm text-muted">{book.authors}</p>}
          <p className="mt-1 text-sm">{formatProgress(book)}</p>
          {pct != null && (
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
            </div>
          )}
        </div>
      </div>
      {editing === "progress" && <ProgressEditor book={book} onDone={done} />}
      {editing === "note" && <NoteEditor book={book} onDone={done} />}
      {!editing && (
        <div className="mt-3 flex gap-2">
          <Button type="button" size="sm" onClick={() => setEditing("progress")}>
            {t.progress}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing("note")}>
            {t.note}
          </Button>
        </div>
      )}
    </li>
  );
}

export function OfflineShelf() {
  // IndexedDB'dagi nusxa va navbat (fon sinxronlash yoki yangi yozuvdan keyin oʻzi yangilanadi)
  const { loaded, snapshot, pending } = useSyncExternalStore(subscribeOffline, getOfflineState, getServerOfflineState);
  const [flash, setFlash] = useState(false);
  const navOnline = useNavigatorOnline();
  const nextOffline = useOffline();
  const online = navOnline && !nextOffline;

  if (!loaded) return <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />;

  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <p className="text-4xl" aria-hidden>
          📚
        </p>
        <p className="mx-auto mt-3 max-w-md text-muted">{t.empty}</p>
        {online && (
          <a href="/kirish?next=/oflayn" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
            {t.signIn} →
          </a>
        )}
      </div>
    );
  }

  const reading = snapshot.books.filter((b) => b.status === "reading" || b.status === "read");
  const want = snapshot.books.filter((b) => b.status === "want");
  // "09.11, 20:42" (Toshkent vaqti)
  const syncedTime = new Date(snapshot.syncedAt)
    .toLocaleString("en-GB", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .replace("/", ".");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
        <span className={cn("font-medium", online ? "text-accent" : "text-warning")}>{online ? `● ${t.online}` : `● ${t.offline}`}</span>
        <span className="text-muted">{pending ? t.pending(pending) : t.synced(syncedTime)}</span>
        {pending > 0 && online && (
          <Button type="button" size="sm" variant="secondary" onClick={requestSync}>
            {t.syncNow}
          </Button>
        )}
      </div>
      {flash && <p className="text-sm text-accent">{t.saved}</p>}

      <section>
        <h2 className="mb-3 font-serif text-xl font-semibold">{t.reading}</h2>
        {reading.length ? (
          <ul className="space-y-3">
            {reading.map((b) => (
              <ReadingCard
                key={b.id}
                book={b}
                onSaved={() => {
                  setFlash(true);
                  window.setTimeout(() => setFlash(false), 4000);
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t.noReading}</p>
        )}
      </section>

      {want.length > 0 && (
        <section>
          <h2 className="mb-3 font-serif text-xl font-semibold">{t.want}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {want.map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
                <Cover book={b} />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug">{b.title}</p>
                  {b.authors && <p className="truncate text-xs text-muted">{b.authors}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
