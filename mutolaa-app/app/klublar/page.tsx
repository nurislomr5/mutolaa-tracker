import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookCover } from "@/components/book/book-cover";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { listClubs, type ClubCard } from "@/lib/clubs";
import { uz } from "@/lib/i18n/uz";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: uz.clubs.title, description: uz.clubs.intro, alternates: { canonical: "/klublar" } };

const t = uz.clubs;

function ClubGrid({ clubs }: { clubs: ClubCard[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {clubs.map((c) => (
        <li key={c.id}>
          <Link href={`/klub/${c.slug}`} className="flex h-full gap-3 rounded-2xl border border-border bg-surface p-4 hover:bg-surface-2">
            <div className="w-14 shrink-0">
              {c.book_cover ? (
                <BookCover src={c.book_cover} title={c.book_title ?? c.name} sizes="56px" />
              ) : (
                <div className="flex aspect-[520/697] items-center justify-center rounded-lg bg-accent-soft text-2xl" aria-hidden>
                  📚
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold leading-snug">{c.name}</p>
              {c.book_title && <p className="truncate text-sm text-muted">📖 {c.book_title}</p>}
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                <Badge>{t.members(c.member_count)}</Badge>
                {!c.is_public && <Badge tone="warning">{t.privateBadge}</Badge>}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function Clubs() {
  const user = await getSessionUser();
  const [open, mine] = await Promise.all([listClubs(false), user ? listClubs(true) : Promise.resolve([])]);
  return (
    <>
      {mine.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-serif text-xl font-semibold">{t.mine}</h2>
          <ClubGrid clubs={mine} />
        </section>
      )}
      <section>
        <h2 className="mb-3 font-serif text-xl font-semibold">{t.open}</h2>
        {open.length ? <ClubGrid clubs={open} /> : <p className="text-muted">{t.empty}</p>}
      </section>
    </>
  );
}

export default function ClubsPage() {
  return (
    <Container className="py-8 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold">{t.title}</h1>
          <p className="mt-1 max-w-2xl text-muted">{t.intro}</p>
        </div>
        <Link href="/klublar/yangi" className={buttonClasses()}>
          {t.create}
        </Link>
      </div>
      <div className="mt-8">
        <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
          <Clubs />
        </Suspense>
      </div>
    </Container>
  );
}
