"use client";

import Link from "next/link";
import { useActionState, useRef, useTransition } from "react";
import { addNote, deleteNote, setNoteResolved } from "@/app/actions/shelf";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { NOTE_TYPES, type Note } from "@/lib/shelf-types";
import { cn } from "@/lib/utils";

const TONE = { iqtibos: "accent", savol: "warning", lugat: "neutral", xulosa: "accent", taymkod: "neutral" } as const;

export function NoteItem({ note, book }: { note: Note; book?: { slug: string; title: string } }) {
  const [pending, start] = useTransition();
  const t = uz.notes;
  return (
    <li className={cn("rounded-xl border border-border bg-surface p-4", pending && "opacity-60", note.is_resolved && "opacity-70")}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={TONE[note.type]}>{uz.noteType[note.type]}</Badge>
        {note.is_resolved && <Badge>{t.resolved}</Badge>}
        {book && (
          <Link href={`/kitob/${book.slug}`} className="font-medium text-text hover:text-accent">
            {book.title}
          </Link>
        )}
        {note.reference_point && <span className="text-muted">· {note.reference_point}</span>}
        <span className="ml-auto text-muted">{formatDate(note.created_at)}</span>
      </div>
      <p className={cn("whitespace-pre-line text-sm", note.type === "iqtibos" && "font-serif italic")}>{note.content}</p>
      <div className="mt-3 flex gap-4 text-xs">
        {note.type === "savol" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => void (await setNoteResolved(note.id, !note.is_resolved)))}
            className="text-accent hover:underline"
          >
            {note.is_resolved ? t.reopen : t.resolve}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm(t.deleteConfirm)) start(async () => void (await deleteNote(note.id)));
          }}
          className="text-muted hover:text-danger"
        >
          {t.delete}
        </button>
      </div>
    </li>
  );
}

export function NoteForm({ userBookId }: { userBookId: number }) {
  const t = uz.notes;
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof addNote>> | null, fd: FormData) => {
    const result = await addNote(prev, fd);
    if (result.ok) formRef.current?.reset();
    return result;
  }, null);

  return (
    <form ref={formRef} action={action} className="space-y-2 rounded-xl border border-dashed border-border p-4">
      <input type="hidden" name="userBookId" value={userBookId} />
      <div className="flex gap-2">
        <select name="type" aria-label={t.type} className="h-10 rounded-lg border border-border bg-surface px-2 text-sm">
          {NOTE_TYPES.map((nt) => (
            <option key={nt} value={nt}>
              {uz.noteType[nt]}
            </option>
          ))}
        </select>
        <Input name="reference" aria-label={t.reference} placeholder={t.referencePlaceholder} maxLength={100} />
      </div>
      <textarea
        name="content"
        required
        rows={3}
        maxLength={5_000}
        aria-label={t.content}
        placeholder={t.contentPlaceholder}
        className="w-full rounded-lg border border-border bg-surface p-3 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {t.add}
        </Button>
        {state && !state.ok && <span className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
