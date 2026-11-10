"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { addNote, deleteNote, saveNoteAnswer, setNoteResolved } from "@/app/actions/shelf";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { NOTE_TYPES, type Note } from "@/lib/shelf-types";
import { site, siteHost } from "@/lib/site";
import { cn } from "@/lib/utils";

const TONE = { iqtibos: "accent", savol: "warning", lugat: "neutral", xulosa: "accent", taymkod: "neutral" } as const;

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

async function shareQuoteImage(body: string, bookTitle?: string, refPoint?: string | null) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Fon
  const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, "#14261c");
  grad.addColorStop(1, "#1f3d2d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1080);

  // Ichki ramka
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 3;
  ctx.strokeRect(64, 64, 952, 952);

  // Qoʻshtirnoq belgisi
  ctx.fillStyle = "rgba(212, 175, 55, 0.35)";
  ctx.font = "bold 160px Georgia, serif";
  ctx.fillText("“", 110, 230);

  // Iqtibos matni
  ctx.fillStyle = "#f7f4ee";
  ctx.font = "italic 40px Georgia, serif";
  const lines = wrapCanvasText(ctx, body, 820, 10);
  let y = 310;
  for (const ln of lines) {
    ctx.fillText(ln, 130, y);
    y += 58;
  }

  // Kitob nomi va joyi
  if (bookTitle) {
    ctx.fillStyle = "#d4af37";
    ctx.font = "600 32px system-ui, sans-serif";
    ctx.fillText(`— ${bookTitle.slice(0, 48)}`, 130, 890);
  }
  if (refPoint) {
    ctx.fillStyle = "rgba(247,244,238,0.68)";
    ctx.font = "400 26px system-ui, sans-serif";
    ctx.fillText(refPoint.slice(0, 50), 130, 935);
  }

  // Brending
  ctx.fillStyle = "rgba(247,244,238,0.5)";
  ctx.font = "500 24px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`${site.name} · ${siteHost()}`, 970, 965);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  const file = new File([blob], `${site.slug}-iqtibos.png`, { type: "image/png" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: bookTitle ?? `${site.name} iqtibos` });
      return;
    } catch {
      // user cancelled or share failed; fall back to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${site.slug}-iqtibos.png`;
  a.click();
  URL.revokeObjectURL(url);
}

export function NoteItem({ note, book }: { note: Note; book?: { slug: string; title: string } }) {
  const [pending, start] = useTransition();
  const t = uz.notes;
  const { content: body, answer } = note;
  const [editingAnswer, setEditingAnswer] = useState(false);
  const [answerText, setAnswerText] = useState(answer ?? "");

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
        <button
          type="button"
          onClick={() => void shareQuoteImage(body, book?.title, note.reference_point)}
          className="text-muted hover:text-accent"
        >
          📤 {t.shareQuote}
        </button>
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
