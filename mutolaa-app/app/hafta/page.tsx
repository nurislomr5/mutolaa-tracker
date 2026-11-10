import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BookGrid } from "@/components/book/book-card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { CARD_COLUMNS, type BookCardData } from "@/lib/catalog";
import { formatCount, formatDuration } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { todayInTashkent } from "@/lib/shelf-types";
import { addDays } from "@/lib/stats-utils";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { parseWeekStart, summarizeWeek, weekStartOf, type WeekSession } from "@/lib/weekly";

export const metadata: Metadata = { title: uz.week.title, robots: { index: false } };

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string | null }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

const compare = (now: number, before: number, more: (n: number) => string, less: (n: number) => string) =>
  now > before ? more(now - before) : now < before ? less(before - now) : null;

// Tanlangan va undan oldingi hafta (solishtirish uchun) sessiyalari hamda shu haftada tugatilgan kitoblar
async function loadWeek(userId: string, start: string) {
  const supabase = await createServerSupabase();
  const [{ data: sessions, error }, { data: finished, error: finishedError }] = await Promise.all([
    supabase
      .from("reading_sessions")
      .select("delta, created_at, user_books!inner(unit)")
      .eq("user_id", userId)
      .gt("delta", 0)
      .gte("created_at", `${addDays(start, -7)}T00:00:00+05:00`)
      .lt("created_at", `${addDays(start, 7)}T00:00:00+05:00`),
    supabase
      .from("user_books")
      .select(`books!inner(${CARD_COLUMNS})`)
      .eq("user_id", userId)
      .eq("status", "read")
      .gte("finished_at", start)
      .lte("finished_at", addDays(start, 6))
      .order("finished_at", { ascending: false }),
  ]);
  if (error) throw new Error(`Sessiyalar: ${error.message}`);
  if (finishedError) throw new Error(`Javon: ${finishedError.message}`);
  const rows: WeekSession[] = ((sessions ?? []) as unknown as { delta: number; created_at: string; user_books: { unit: string } }[]).map((s) => ({
    delta: s.delta,
    created_at: s.created_at,
    unit: s.user_books.unit,
  }));
  return {
    week: summarizeWeek(rows, start),
    previous: summarizeWeek(rows, addDays(start, -7)),
    finished: ((finished ?? []) as unknown as { books: BookCardData }[]).map((r) => r.books),
  };
}

async function WeekView({ searchParams }: { searchParams: PageProps<"/hafta">["searchParams"] }) {
  const user = await getSessionUser();
  if (!user) redirect("/kirish?next=/hafta");
  const sp = await searchParams;
  const today = todayInTashkent();
  const currentStart = weekStartOf(today);
  // kelajakdagi hafta soʻralsa — joriy hafta
  const requested = parseWeekStart(sp.h);
  const start = requested && requested <= currentStart ? requested : currentStart;
  const isCurrent = start === currentStart;
  const { week, previous, finished } = await loadWeek(user.id, start);
  const t = uz.week;
  const hasData = week.activeDays > 0 || finished.length > 0;

  return (
    <>
      <div className="mb-6 mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-2 text-muted">
          {t.range(week.start, week.end)}
          {isCurrent && <Badge tone="accent">{t.thisWeek}</Badge>}
        </p>
        <nav className="flex flex-wrap gap-2" aria-label={t.title}>
          <Link href={`/hafta?h=${addDays(start, -7)}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            {t.prev}
          </Link>
          {!isCurrent && (
            <Link
              href={addDays(start, 7) === currentStart ? "/hafta" : `/hafta?h=${addDays(start, 7)}`}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              {t.next}
            </Link>
          )}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label={t.activeDays}
          value={
            <>
              {week.activeDays}
              <span className="text-base font-normal text-muted"> / 7</span>
            </>
          }
          sub={compare(week.activeDays, previous.activeDays, t.moreDays, t.lessDays)}
        />
        <Tile label={uz.stats.pages} value={formatCount(week.pages)} sub={compare(week.pages, previous.pages, t.morePages, t.lessPages)} />
        <Tile
          label={uz.stats.listened}
          value={formatDuration(week.minutes * 60) ?? "0"}
          sub={compare(week.minutes, previous.minutes, t.moreMinutes, t.lessMinutes)}
        />
        <Tile label={t.finished} value={finished.length} />
      </div>
      <p className="mt-2 text-xs text-muted">{uz.stats.percentNote}</p>

      <Card className="mt-6">
        <CardTitle>{t.daysTitle}</CardTitle>
        <ol className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
          {week.days.map((d, i) => (
            <li
              key={d.day}
              title={t.weekdaysLong[i]}
              className={cn(
                "rounded-xl border px-1 py-2 text-center",
                d.sessions > 0 ? "border-accent/40 bg-accent/5" : "border-border bg-surface-2",
                d.day > today && "opacity-50",
              )}
            >
              <p className={cn("text-xs", d.day === today ? "font-semibold text-accent" : "text-muted")}>{t.weekdays[i]}</p>
              <p className="text-sm font-semibold">{Number(d.day.slice(8))}</p>
              <p className="mt-1 text-[11px] leading-tight text-muted">
                {d.sessions === 0 ? (
                  "—"
                ) : d.pages || d.minutes ? (
                  <>
                    {d.pages > 0 && <span className="block">{t.pagesShort(d.pages)}</span>}
                    {d.minutes > 0 && <span className="block">{t.minutesShort(d.minutes)}</span>}
                  </>
                ) : (
                  t.activeOnly
                )}
              </p>
            </li>
          ))}
        </ol>
      </Card>

      {!hasData && <p className="py-10 text-center text-muted">{isCurrent ? t.empty : t.emptyPast}</p>}

      {finished.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-serif text-xl font-semibold">{t.finishedTitle}</h2>
          <BookGrid books={finished} />
        </section>
      )}

      <p className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {!isCurrent && (
          <Link href="/hafta" className="text-accent hover:underline">
            {t.current}
          </Link>
        )}
        <Link href="/statistika" className="text-accent hover:underline">
          {t.statsLink}
        </Link>
      </p>
    </>
  );
}

export default function WeekPage(props: PageProps<"/hafta">) {
  return (
    <Container className="py-8 sm:py-10">
      <h1 className="font-serif text-3xl font-semibold">{uz.week.title}</h1>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-surface-2" />}>
        <WeekView searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
