import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookGrid } from "@/components/book/book-card";
import { ActivityHeatmap } from "@/components/stats/activity-heatmap";
import { BarList } from "@/components/stats/bar-list";
import { MonthBars } from "@/components/stats/month-bars";
import { Card, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Progress } from "@/components/ui/progress";
import { formatCount, formatDuration } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { todayInTashkent } from "@/lib/shelf-types";
import { getYearStats, type YearStats } from "@/lib/stats";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: uz.stats.title };

function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

function GoalCard({ stats }: { stats: YearStats }) {
  const t = uz.stats;
  const read = stats.finished.length;
  let pace: string | null = null;
  if (stats.goal && read >= stats.goal) pace = t.goalDone;
  else if (stats.expectedByToday != null) {
    const diff = Math.round(read - stats.expectedByToday);
    pace = diff > 0 ? t.ahead(diff) : diff < 0 ? t.behind(-diff) : t.onTrack;
  }
  return (
    <Card className="flex flex-col justify-between gap-4 sm:col-span-2 lg:row-span-2">
      <div>
        <p className="text-sm text-muted">{t.booksRead}</p>
        {/* Sahifadagi yagona "hero" raqam */}
        <p className="mt-1 text-6xl font-semibold leading-none">
          {read}
          {stats.goal ? <span className="text-2xl font-normal text-muted"> / {stats.goal}</span> : null}
        </p>
      </div>
      {stats.goal ? (
        <div>
          <Progress value={read} max={stats.goal} />
          <p className="mt-2 text-sm text-muted">
            {t.goal(stats.goal)}
            {pace && <> · <span className="text-text">{pace}</span></>}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {t.noGoal} ·{" "}
          <Link href="/sozlamalar" className="text-accent hover:underline">
            {t.setGoal}
          </Link>
        </p>
      )}
    </Card>
  );
}

async function StatsView({ searchParams }: { searchParams: PageProps<"/statistika">["searchParams"] }) {
  const sp = await searchParams;
  const requested = typeof sp.yil === "string" && /^\d{4}$/.test(sp.yil) ? Number(sp.yil) : undefined;
  const stats = await getYearStats(requested);
  const t = uz.stats;
  const today = todayInTashkent();
  const hasData = stats.finished.length > 0 || stats.activeDays > 0;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-muted">{t.subtitle(stats.year)}</p>
        {stats.years.length > 1 && (
          <nav className="flex gap-1" aria-label="Yillar">
            {stats.years.map((y) => (
              <Link
                key={y}
                href={`/statistika?yil=${y}`}
                className={cn(
                  "rounded-full px-3 py-1 text-sm",
                  y === stats.year ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                {y}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <GoalCard stats={stats} />
        <StatTile label={t.streak} value={t.days(stats.streak.current)} sub={t.longestStreak(stats.streak.longest)} />
        <StatTile label={t.activeDays} value={formatCount(stats.activeDays)} />
        <StatTile label={t.pages} value={formatCount(stats.pages)} />
        <StatTile label={t.listened} value={formatDuration(stats.minutes * 60) ?? "0"} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatTile label={t.readingNow} value={stats.readingNow} />
        <StatTile label={t.avgRating} value={stats.avgRating ? `★ ${stats.avgRating.toFixed(1)}` : t.noRating} />
      </div>
      <p className="mt-2 text-xs text-muted">{t.percentNote}</p>

      <Card className="mt-6">
        <CardTitle>{t.activityTitle}</CardTitle>
        <p className="mb-4 mt-1 text-xs text-muted">{t.activityHint}</p>
        <ActivityHeatmap year={stats.year} activity={stats.activity} today={today} />
      </Card>

      {!hasData && <p className="py-10 text-center text-muted">{t.empty}</p>}

      {stats.finished.length > 0 && (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardTitle>{t.monthlyTitle}</CardTitle>
              <div className="mt-4">
                <MonthBars values={stats.monthly} currentMonth={stats.isCurrentYear ? Number(today.slice(5, 7)) - 1 : null} />
              </div>
            </Card>
            <div className="grid gap-4">
              <Card>
                <CardTitle>{t.formatTitle}</CardTitle>
                <div className="mt-4">
                  <BarList items={stats.byFormat.map((f) => ({ label: uz.format[f.format], value: f.count }))} />
                </div>
              </Card>
              {stats.byTopic.length > 0 && (
                <Card>
                  <CardTitle>{t.topicTitle}</CardTitle>
                  <div className="mt-4">
                    <BarList items={stats.byTopic.map((tp) => ({ label: tp.name, value: tp.count, href: `/kitoblar?rukn=${tp.slug}` }))} />
                  </div>
                </Card>
              )}
            </div>
          </div>

          <section className="mt-10">
            <h2 className="mb-4 font-serif text-xl font-semibold">{t.finishedTitle(stats.year)}</h2>
            <BookGrid books={stats.finished} />
          </section>
        </>
      )}
    </>
  );
}

export default function StatsPage(props: PageProps<"/statistika">) {
  return (
    <Container className="py-8 sm:py-10">
      <h1 className="font-serif text-3xl font-semibold">{uz.stats.title}</h1>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-surface-2" />}>
        <StatsView searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
