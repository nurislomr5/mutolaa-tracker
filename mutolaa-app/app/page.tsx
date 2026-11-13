import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Card, CardTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { BookGrid } from "@/components/book/book-card";
import { getNewPaperBooks, getPopularBooks, getPublishers, getTopics } from "@/lib/catalog";
import { Suspense } from "react";
import { BookCover } from "@/components/book/book-cover";
import { Progress } from "@/components/ui/progress";
import { uz } from "@/lib/i18n/uz";
import { FeedItemCard } from "@/components/social/feed-item";
import { getOnboarding, getRecommendedBooks } from "@/lib/onboarding";
import { getProfile, getShelfItems, type ShelfItem } from "@/lib/shelf";
import { getFeed } from "@/lib/social";
import { getYearStats, type YearStats } from "@/lib/stats";
import { getSessionUser } from "@/lib/supabase/server";

// Yillik maqsad va streak — statistika sahifasidagi hisobning qisqa koʻrinishi
function YearGoal({ stats }: { stats: YearStats }) {
  const t = uz.stats;
  const read = stats.finished.length;
  let pace: string | null = null;
  if (stats.goal && read >= stats.goal) pace = t.goalDone;
  else if (stats.expectedByToday != null) {
    const diff = Math.round(read - stats.expectedByToday);
    pace = diff > 0 ? t.ahead(diff) : diff < 0 ? t.behind(-diff) : t.onTrack;
  }
  const streak = stats.streak.current > 0 ? `🔥 ${t.streak}: ${t.days(stats.streak.current)}` : null;
  return (
    <div className="mt-5 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      {stats.goal ? (
        <Progress value={read} max={stats.goal} label={uz.home.goalProgress(read, stats.goal)} />
      ) : (
        <p className="text-sm text-muted">
          {uz.home.readThisYear(read)} ·{" "}
          <Link href="/sozlamalar" className="text-accent hover:underline">
            {t.setGoal}
          </Link>
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted">
        <span>{[pace, streak].filter(Boolean).join(" · ")}</span>
        <Link href="/statistika" className="text-accent hover:underline">
          {uz.home.statsLink}
        </Link>
      </div>
    </div>
  );
}

function NowReading({ items }: { items: ShelfItem[] }) {
  if (!items.length) return null;
  return (
    <Container className="pt-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-serif text-2xl font-semibold">{uz.shelf.nowReading}</h2>
        <Link href="/javonim" className="text-sm text-accent hover:underline">
          {uz.shelf.seeShelf}
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.slice(0, 6).map((it) => (
          <Link key={it.id} href={`/kitob/${it.book.slug}`} className="flex gap-3 rounded-2xl border border-border bg-surface p-3 hover:bg-surface-2">
            <BookCover src={it.book.cover_url} title={it.book.title} sizes="56px" className="w-14 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold">{it.book.title}</p>
              <p className="line-clamp-1 text-xs text-muted">{it.book.author_names}</p>
              {it.total_value ? (
                <Progress value={it.current_value} max={it.total_value} className="mt-2" label={`${it.current_value} / ${it.total_value} ${uz.shelf.unit[it.unit]}`} />
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </Container>
  );
}

// Kirgan foydalanuvchining bosh sahifasi: salom, yillik maqsad, oʻqilayotgan kitoblar, tavsiyalar, doʻstlar lentasi.
// Mehmonlar uchun tanishtiruv (.guest-only) kirgan foydalanuvchidan yashiriladi: birinchi chizilishdagi taxminni
// lib/theme.ts dagi skript beradi (cookie bormi), yakuniy qaror — shu yerdagi <style> (sessiya haqiqatan bormi).
async function Personal() {
  if (!(await getSessionUser())) return <style>{"html[data-auth] .guest-only{display:revert}"}</style>;
  const [profile, onboarding, reading, stats, recommended, feed] = await Promise.all([
    getProfile(),
    getOnboarding(),
    getShelfItems({ status: "reading" }),
    // statistika yoki lenta ishlamasa ham bosh sahifa ochilishi kerak
    getYearStats().catch(() => null),
    getRecommendedBooks(12),
    getFeed("following", 4).catch(() => null),
  ]);
  const t = uz.home;
  const name = profile?.display_name || (profile?.username ? `@${profile.username}` : null);
  return (
    <>
      <style>{".guest-only{display:none}"}</style>
      <Container className="pt-8 sm:pt-10">
        <h1 className="font-serif text-3xl font-semibold">{name ? t.greeting(name) : t.greetingNoName}</h1>
        {stats && <YearGoal stats={stats} />}
        {onboarding && !onboarding.onboarded && (
          <Card className="mt-4 flex flex-wrap items-center justify-between gap-4 border-accent/40">
            <div className="min-w-0 flex-1 basis-64">
              <CardTitle>{t.onboardingTitle}</CardTitle>
              <p className="mt-1 text-sm text-muted">{t.onboardingBody}</p>
            </div>
            <Link href="/tanishuv" className={buttonClasses({})}>
              {t.onboardingCta}
            </Link>
          </Card>
        )}
      </Container>

      <NowReading items={reading} />

      {recommended.length > 0 && (
        <Container className="pt-10">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl font-semibold">{t.forYou}</h2>
              <p className="text-sm text-muted">{t.forYouHint}</p>
            </div>
            <Link href="/tanishuv" className="shrink-0 text-sm text-accent hover:underline">
              {t.editInterests}
            </Link>
          </div>
          <BookGrid books={recommended} />
        </Container>
      )}

      {feed && feed.items.length > 0 && (
        <Container className="pt-10">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-serif text-2xl font-semibold">{t.friendsTitle}</h2>
            <Link href="/lenta" className="text-sm text-accent hover:underline">
              {t.friendsAll}
            </Link>
          </div>
          <ul className="grid gap-3 lg:grid-cols-2">
            {feed.items.map((item) => (
              <FeedItemCard key={item.id} item={item} now={feed.now} />
            ))}
          </ul>
        </Container>
      )}
    </>
  );
}

const HOME_TOPICS = 14;

async function Popular() {
  const [books, topics, newBooks, publishers] = await Promise.all([
    getPopularBooks(12),
    getTopics(),
    getNewPaperBooks(12),
    getPublishers(),
  ]);
  // eng koʻp kitobli ruknlar; toʻliq roʻyxat — /ruknlar sahifasida
  const topTopics = [...topics].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, HOME_TOPICS);
  return (
    <Container className="py-14">
      {newBooks.length > 0 && (
        <section className="mb-14">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl font-semibold">{uz.publishers.newBooks}</h2>
              <p className="text-sm text-muted">{uz.publishers.newBooksHint}</p>
            </div>
            <Link href="/kitoblar?format=paper&til=uz&sort=new" className="shrink-0 text-sm text-accent hover:underline">
              {uz.popular.seeAll}
            </Link>
          </div>
          <BookGrid books={newBooks} />
        </section>
      )}

      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="font-serif text-2xl font-semibold">{uz.popular.title}</h2>
        <Link href="/kitoblar" className="text-sm text-accent hover:underline">
          {uz.popular.seeAll}
        </Link>
      </div>
      <BookGrid books={books} />

      {publishers.length > 0 && (
        <>
          <div className="mb-4 mt-14 flex items-baseline justify-between">
            <h2 className="font-serif text-2xl font-semibold">{uz.publishers.title}</h2>
            <Link href="/nashriyotlar" className="text-sm text-accent hover:underline">
              {uz.publishers.allPublishers}
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {publishers.slice(0, 16).map((p) => (
              <Link
                key={p.slug}
                href={`/nashriyot/${p.slug}`}
                prefetch={false}
                className="rounded-full border border-border bg-surface px-3 py-1 text-sm text-muted transition-colors hover:text-text"
              >
                {p.name} <span className="text-xs opacity-70">{p.count}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="mb-4 mt-14 flex items-baseline justify-between">
        <h2 className="font-serif text-2xl font-semibold">{uz.popular.topicsTitle}</h2>
        <Link href="/ruknlar" className="text-sm text-accent hover:underline">
          {uz.popular.allTopics}
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {topTopics.map((tp) => (
          <Link
            key={tp.slug}
            href={`/kitoblar?rukn=${tp.slug}`}
            className="rounded-full border border-border bg-surface px-3 py-1 text-sm text-muted transition-colors hover:text-text"
          >
            {tp.name} <span className="text-xs opacity-70">{tp.count}</span>
          </Link>
        ))}
      </div>
    </Container>
  );
}

export default function HomePage() {
  const t = uz.home;
  return (
    <>
      <section className="guest-only border-b border-border bg-surface-2/50">
        <Container className="py-16 sm:py-24">
          <p className="mb-3 text-sm font-medium text-accent">{t.eyebrow}</p>
          <h1 className="max-w-3xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">{t.title}</h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">{t.subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/kitoblar" className={buttonClasses({ size: "lg" })}>
              {t.ctaCatalog}
            </Link>
            <Link href="/kirish" className={buttonClasses({ size: "lg", variant: "secondary" })}>
              {t.ctaSignIn}
            </Link>
          </div>
          <p className="mt-6 text-sm text-muted">{t.searchHint}</p>
        </Container>
      </section>

      <Suspense fallback={null}>
        <Personal />
      </Suspense>

      <Popular />

      <Container className="guest-only border-t border-border py-14">
        <h2 className="mb-6 font-serif text-2xl font-semibold">{t.featuresTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {t.features.map((f) => (
            <Card key={f.title}>
              <CardTitle>{f.title}</CardTitle>
              <p className="mt-2 text-sm text-muted">{f.body}</p>
            </Card>
          ))}
        </div>
      </Container>
    </>
  );
}
