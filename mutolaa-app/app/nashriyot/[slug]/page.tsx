import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookGrid, BookGridSkeleton } from "@/components/book/book-card";
import { FollowEntity } from "@/components/social/follow-entity";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { getCatalog, getPublisher, getPublishers, PAGE_SIZE } from "@/lib/catalog";
import { formatCount } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { site } from "@/lib/site";

export async function generateStaticParams() {
  const publishers = await getPublishers();
  return publishers.length ? publishers.slice(0, 20).map((p) => ({ slug: p.slug })) : [{ slug: "asaxiy-books" }];
}

export async function generateMetadata({ params }: PageProps<"/nashriyot/[slug]">): Promise<Metadata> {
  const publisher = await getPublisher((await params).slug);
  if (!publisher) return { title: uz.notFound.title };
  return {
    title: `${publisher.name} kitoblari`,
    description: `${publisher.name} nashriyotining kitoblari, ularning narxi, betlar soni va yangi nashrlari ${site.name} katalogida.`,
    alternates: { canonical: `/nashriyot/${publisher.slug}` },
  };
}

async function PublisherView({ params, searchParams }: PageProps<"/nashriyot/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = typeof sp.sahifa === "string" && /^\d{1,4}$/.test(sp.sahifa) ? Math.max(1, Number(sp.sahifa)) : 1;
  const [publisher, { books, total }] = await Promise.all([getPublisher(slug), getCatalog({ publisher: slug, sort: "new", page })]);
  if (!publisher) notFound();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const t = uz.catalog;

  return (
    <>
      <div className="mb-8">
        <Link href="/nashriyotlar" className="text-sm text-muted hover:text-accent">
          ← {uz.publishers.title}
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-semibold">{publisher.name}</h1>
        <p className="text-muted">{uz.publishers.books(formatCount(total))}</p>
        <div className="mt-2">
          <Suspense fallback={null}>
            <FollowEntity kind="publisher" id={publisher.id} />
          </Suspense>
        </div>
      </div>
      <BookGrid books={books} priorityCount={6} />
      {pages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Sahifalar">
          {page > 1 && (
            <Link href={`/nashriyot/${slug}?sahifa=${page - 1}`} className={buttonClasses({ variant: "secondary" })}>
              {t.prev}
            </Link>
          )}
          <span className="text-sm text-muted">{t.pageOf(page, pages)}</span>
          {page < pages && (
            <Link href={`/nashriyot/${slug}?sahifa=${page + 1}`} className={buttonClasses({ variant: "secondary" })}>
              {t.next}
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

export default function PublisherPage(props: PageProps<"/nashriyot/[slug]">) {
  return (
    <Container className="py-8 sm:py-12">
      <Suspense
        fallback={
          <>
            <div className="mb-8 h-16 w-1/2 animate-pulse rounded bg-surface-2" />
            <BookGridSkeleton />
          </>
        }
      >
        <PublisherView {...props} />
      </Suspense>
    </Container>
  );
}
