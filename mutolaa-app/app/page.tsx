import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Card, CardTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { BookGrid } from "@/components/book/book-card";
import { getPopularBooks, getTopics } from "@/lib/catalog";
import { Suspense } from "react";
import { BookCover } from "@/components/book/book-cover";
import { Progress } from "@/components/ui/progress";
import { uz } from "@/lib/i18n/uz";
import { getShelfItems } from "@/lib/shelf";
import { getSessionUser } from "@/lib/supabase/server";

// Kirgan foydalanuvchi uchun: hozir oʻqilayotgan kitoblar (mehmonga hech narsa koʻrinmaydi)
async function NowReading() {
  if (!(await getSessionUser())) return null;
  const items = await getShelfItems({ status: "reading" });
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

async function Popular() {
  const [books, topics] = await Promise.all([getPopularBooks(12), getTopics()]);
  return (
    <Container className="py-14">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="font-serif text-2xl font-semibold">{uz.popular.title}</h2>
        <Link href="/kitoblar" className="text-sm text-accent hover:underline">
          {uz.popular.seeAll}
        </Link>
      </div>
      <BookGrid books={books} />

      <h2 className="mb-4 mt-14 font-serif text-2xl font-semibold">{uz.popular.topicsTitle}</h2>
      <div className="flex flex-wrap gap-2">
        {topics.map((tp) => (
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
      <section className="border-b border-border bg-surface-2/50">
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
        <NowReading />
      </Suspense>

      <Popular />

      <Container className="border-t border-border py-14">
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
