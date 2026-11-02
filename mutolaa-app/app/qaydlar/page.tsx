import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NoteItem } from "@/components/shelf/notes";
import { Container } from "@/components/ui/container";
import { uz } from "@/lib/i18n/uz";
import { getNotes, NOTE_TYPES, type NoteType } from "@/lib/shelf";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: uz.notes.title };

function Filter({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
        active ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface text-muted hover:text-text",
      )}
    >
      {children}
    </Link>
  );
}

async function NotesView({ searchParams }: { searchParams: PageProps<"/qaydlar">["searchParams"] }) {
  const sp = await searchParams;
  const openOnly = sp.ochiq === "1";
  const type = !openOnly && NOTE_TYPES.includes(sp.tur as NoteType) ? (sp.tur as NoteType) : undefined;
  const notes = await getNotes({ type, openOnly });

  return (
    <>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Filter href="/qaydlar" active={!type && !openOnly}>
          {uz.notes.all}
        </Filter>
        <Filter href="/qaydlar?ochiq=1" active={openOnly}>
          ❓ {uz.notes.openQuestions}
        </Filter>
        {NOTE_TYPES.map((nt) => (
          <Filter key={nt} href={`/qaydlar?tur=${nt}`} active={type === nt}>
            {uz.noteType[nt]}
          </Filter>
        ))}
      </div>
      {notes.length > 0 ? (
        <ul className="mt-6 grid gap-3 lg:grid-cols-2">
          {notes.map((n) => (
            <NoteItem key={n.id} note={n} book={n.book} />
          ))}
        </ul>
      ) : (
        <p className="py-16 text-center text-muted">{uz.notes.empty}</p>
      )}
    </>
  );
}

export default function NotesPage(props: PageProps<"/qaydlar">) {
  return (
    <Container className="py-8 sm:py-10">
      <h1 className="font-serif text-3xl font-semibold">{uz.notes.title}</h1>
      <p className="mb-6 mt-1 text-muted">{uz.notes.subtitle}</p>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
        <NotesView searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
