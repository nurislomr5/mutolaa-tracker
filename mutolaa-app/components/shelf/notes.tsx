"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { addNote, deleteNote, saveNoteAnswer, setNoteResolved } from "@/app/actions/shelf";
import { ShareImageButton } from "@/components/share/share-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import type { ShareCard } from "@/lib/share-image";
import { NOTE_TYPES, type Note } from "@/lib/shelf-types";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

const TONE = { iqtibos: "accent", savol: "warning", lugat: "neutral", xulosa: "accent", taymkod: "neutral" } as const;

type NoteBook = { slug: string; title: string; author_names?: string | null; cover_url?: string | null };

export function NoteItem({ note, book }: { note: Note; book?: NoteBook }) {
  const [pending, start] = useTransition();
  const t = uz.notes;
  const { content: body, answer } = note;
  const [editingAnswer, setEditingAnswer] = useState(false);
  const [answerText, setAnswerText] = useState(answer ?? "");
  // iqtibos — qoʻshtirnoq bilan, boshqa qaydlar — turi yozilgan sarlavha bilan chiziladi
  const shareCard: ShareCard = {
    kind: "quote",
    text: body,
    label: note.type === "iqtibos" ? null : uz.noteType[note.type],
    book: book && { title: book.title, author: book.author_names, cover: book.cover_url },
    reference: note.reference_point,
  };

  return (
    <li className={cn("rounded-xl border border-border bg-surface p-4", pending && "opacity-60", note.is_resolved && "opacity-80")}>
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
      <p className={cn("whitespace-pre-line text-sm", note.type === "iqtibos" && "font-serif italic")}>{body}</p>

      {answer && !editingAnswer && (
        <div className="mt-2.5 rounded-lg border border-accent/25 bg-accent/5 p-2.5 text-xs">
          <span className="font-semibold text-accent">💡 {t.answerLabel}: </span>
          <span className="whitespace-pre-line text-text">{answer}</span>
        </div>
      )}

      {editingAnswer && (
        <div className="mt-2.5 flex gap-2">
          <Input
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            placeholder={t.answerPlaceholder}
            maxLength={2000}
            className="h-9 text-xs"
          />
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await saveNoteAnswer(note.id, answerText);
                setEditingAnswer(false);
              })
            }
          >
            {t.saveAnswer}
          </Button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        {note.type === "savol" && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => setEditingAnswer((v) => !v)}
              className="text-accent hover:underline"
            >
              💡 {answer ? t.answerLabel : t.writeAnswer}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => void (await setNoteResolved(note.id, !note.is_resolved)))}
              className="text-accent hover:underline"
            >
              {note.is_resolved ? t.reopen : t.resolve}
            </button>
          </>
        )}
        <ShareImageButton
          card={shareCard}
          fileName={`${site.slug}-${note.type}.png`}
          shareTitle={book ? uz.share.quoteTitle(book.title) : uz.noteType[note.type]}
          className="text-muted hover:text-accent"
        >
          {uz.share.button}
        </ShareImageButton>
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
