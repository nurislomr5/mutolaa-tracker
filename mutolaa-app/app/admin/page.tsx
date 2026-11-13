import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { getAdminUser } from "@/lib/admin";
import { getAdminStats, getRecentSignups, getRecentUserBooks, type AdminStats } from "@/lib/admin-panel";
import { formatCount, formatDate } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: uz.admin.panelTitle, robots: { index: false } };

const t = uz.admin;

function Stat({ label, value, sub, hint }: { label: string; value: number; sub?: string; hint?: string }) {
  return (
    <Card className="p-4" title={hint}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{formatCount(value)}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

// Oxirgi 14 kunda roʻyxatdan oʻtganlar (kunlar Toshkent vaqti boʻyicha — admin_stats() shunday qaytaradi)
function SignupBars({ days }: { days: AdminStats["signups_by_day"] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <ul className="mt-4 flex h-32 items-end gap-1.5">
      {days.map((d) => (
        <li key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={t.signupsDay(d.day, d.count)}>
          <span className="text-[10px] text-muted">{d.count > 0 ? d.count : ""}</span>
          <span
            className={d.count > 0 ? "w-full rounded-t bg-accent" : "w-full rounded-t bg-border"}
            style={{ height: d.count > 0 ? `${Math.max(6, (d.count / max) * 100)}%` : 2 }}
          />
          <span className="text-[10px] text-muted">{d.day.slice(8)}</span>
        </li>
      ))}
    </ul>
  );
}

// Admin paneli: sayt holati bir qarashda. Faqat admin.
async function Panel() {
  if (!(await getAdminUser())) notFound();
  const [stats, people, books] = await Promise.all([getAdminStats(), getRecentSignups(), getRecentUserBooks()]);
  const s = t.stats;
  const openReports = stats.reports_open + stats.book_reports_open;

  return (
    <>
      <Card className={openReports ? "mb-6 border-warning p-4" : "mb-6 p-4"}>
        {openReports ? (
          <Link href="/admin/shikoyatlar" className="font-medium text-warning hover:underline">
            {t.openReports(openReports)}
          </Link>
        ) : (
          <p className="text-sm text-muted">{t.noOpenReports}</p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <Stat label={s.users} value={stats.users_total} sub={s.added7and30(stats.users_7d, stats.users_30d)} />
        <Stat label={`${s.active} · ${s.in7}`} value={stats.active_7d} sub={s.in30(stats.active_30d)} hint={s.activeHint} />
        <Stat label={s.books} value={stats.books_user_total} sub={s.added7(stats.books_user_7d)} hint={s.booksHint} />
        <Stat label={s.catalog} value={stats.books_total} />
        <Stat label={s.shelf} value={stats.shelf_total} sub={s.added7(stats.shelf_7d)} />
        <Stat label={`${s.sessions} · ${s.in7}`} value={stats.sessions_7d} />
        <Stat label={s.reviews} value={stats.reviews_total} />
        <Stat label={s.notes} value={stats.notes_total} />
        <Stat label={s.clubs} value={stats.clubs_total} sub={s.posts7(stats.club_posts_7d)} />
        <Stat label={s.telegram} value={stats.telegram_linked} />
        <Stat label={s.publicProfiles} value={stats.public_profiles} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {s.active}: {s.activeHint}. {s.books}: {s.booksHint}.
      </p>

      <Card className="mt-6">
        <CardTitle>{t.signupsTitle}</CardTitle>
        <SignupBars days={stats.signups_by_day} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{t.recentUsers}</CardTitle>
          {people.length ? (
            <ul className="mt-2 divide-y divide-border text-sm">
              {people.map((p) => {
                const name = p.display_name || (p.username ? `@${p.username}` : t.noName);
                return (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                    {p.is_public && p.username ? (
                      <Link href={`/u/${p.username}`} className="min-w-0 truncate font-medium hover:text-accent">
                        {name}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate">
                        {name} <span className="text-xs text-muted">· {t.privateProfile}</span>
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-muted">{formatDate(p.created_at)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">{t.empty}</p>
          )}
        </Card>
        <Card>
          <CardTitle>{t.recentBooks}</CardTitle>
          {books.length ? (
            <ul className="mt-2 divide-y divide-border text-sm">
              {books.map((b) => (
                <li key={b.id} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    <Link href={`/kitob/${b.slug}`} className="font-medium hover:text-accent">
                      {b.title}
                    </Link>
                    {b.author_names && <span className="text-muted"> — {b.author_names}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{formatDate(b.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">{t.empty}</p>
          )}
        </Card>
      </div>
    </>
  );
}

export default function AdminPage() {
  return (
    <Container className="py-8 sm:py-10">
      <h1 className="font-serif text-3xl font-semibold">{t.panelTitle}</h1>
      <p className="mb-5 mt-1 max-w-3xl text-sm text-muted">{t.panelIntro}</p>
      <AdminNav current="panel" />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
        <Panel />
      </Suspense>
    </Container>
  );
}
