import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookCover } from "@/components/book/book-cover";
import { BookGrid } from "@/components/book/book-card";
import { FormatIcon } from "@/components/book/format-icons";
import { SOURCE_NAMES, WhereToGet } from "@/components/book/where-to-get";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { getAuthor, getBook, getPopularBooks, type BookDetail } from "@/lib/catalog";
import { bookDescription, bookJsonLd } from "@/lib/seo";
import { formatCount, formatDuration, formatRating } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { ReadersSection } from "./readers";
import { EditBookLink, MyBookSection, ShelfActions } from "./shelf-panel";

// Eng mashhur kitoblar build paytida tayyorlanadi, qolganlari birinchi tashrifda keshlanadi
export async function generateStaticParams() {
  const books = await getPopularBooks(48);
  return books.length ? books.map((b) => ({ slug: b.slug })) : [{ slug: "odisseya" }];
}

export async function generateMetadata({ params }: PageProps<"/kitob/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const book = await getBook(slug);
  if (!book) return { title: uz.notFound.title };
  const title = book.author_names ? `${book.title} — ${book.author_names}` : book.title;
  const description = bookDescription(book);
  // OG rasm shu papkadagi opengraph-image.tsx dan avtomatik qoʻshiladi
  return {
    title,
    description,
    alternates: { canonical: `/kitob/${book.slug}` },
    openGraph: { title, description, type: "book", url: `/kitob/${book.slug}` },
  };
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

async function SameAuthor({ book }: { book: BookDetail }) {
  const first = book.authors[0];
  if (!first) return null;
  const author = await getAuthor(first.slug);
  const others = (author?.books ?? []).filter((b) => b.slug !== book.slug).slice(0, 6);
  if (!others.length) return null;
  return (
    <section className="mt-14">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-serif text-xl font-semibold">{uz.book.sameAuthor}</h2>
        <Link href={`/muallif/${first.slug}`} className="text-sm text-accent hover:underline">
          {first.name} →
        </Link>
      </div>
      <BookGrid books={others} />
    </section>
  );
}

async function BookView({ params }: { params: PageProps<"/kitob/[slug]">["params"] }) {
  const { slug } = await params;
  const book = await getBook(slug);
  if (!book) notFound();

  const t = uz.book;
  const rating = formatRating(book.mutolaa_rating);
  const duration = formatDuration(book.audio_seconds);
  const paragraphs = (book.description ?? "").split(/\n+/).map((p) => p.trim()).filter(Boolean);
  // Mutolaa'da rukn va janr nomlari koʻpincha takrorlanadi ("Roman", "Tarixiy") — bir marta koʻrsatamiz
  const topicNames = new Set(book.topics.map((tp) => tp.name.toLowerCase()));
  const genres = book.genres.filter((g) => !topicNames.has(g.name.toLowerCase()));

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: bookJsonLd(book) }} />
      <div className="grid gap-8 md:grid-cols-[240px_1fr] lg:gap-12">
        <div className="mx-auto w-48 md:mx-0 md:w-full">
          <BookCover src={book.cover_url} title={book.title} priority sizes="240px" />
        </div>

        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {book.formats.map((f) => (
              <Badge key={f} tone="accent" className="gap-1">
                <FormatIcon format={f} className="h-3.5 w-3.5" />
                {uz.format[f]}
              </Badge>
            ))}
            {book.is_premium && <Badge tone="warning">{t.premium}</Badge>}
            {book.source === "user" && <Badge>{uz.addBook.userAdded}</Badge>}
            <Suspense fallback={null}>
              <EditBookLink book={book} />
            </Suspense>
          </div>

          <h1 className="font-serif text-3xl font-semibold leading-tight sm:text-4xl">{book.title}</h1>
          {book.authors.length > 0 && (
            <p className="mt-2 text-lg">
              {book.authors.map((a, i) => (
                <span key={a.slug}>
                  {i > 0 && ", "}
                  <Link href={`/muallif/${a.slug}`} className="text-accent hover:underline">
                    {a.name}
                  </Link>
                </span>
              ))}
            </p>
          )}

          {(rating || book.mutolaa_reading_count) && (
            <p className="mt-3 text-sm text-muted">
              {rating && t.ratingOnMutolaa(rating, formatCount(book.mutolaa_rating_count))}
              {rating && book.mutolaa_reading_count ? " · " : ""}
              {book.mutolaa_reading_count ? t.readers(formatCount(book.mutolaa_reading_count)) : ""}
            </p>
          )}

          <div className="mt-6 space-y-3">
            <Suspense fallback={<div className="h-11 animate-pulse rounded-lg bg-surface-2" />}>
              <ShelfActions book={book} />
            </Suspense>
            {/* manbalar roʻyxati boʻlmagan (eski/qoʻlda qoʻshilgan) kitoblar uchun */}
            {book.sources.length === 0 && book.source_url && (
              <a href={book.source_url} target="_blank" rel="noreferrer" className={buttonClasses({ size: "lg", variant: "secondary" })}>
                {t.openOnMutolaa} ↗
              </a>
            )}
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-4 border-y border-border py-5 sm:grid-cols-4">
            {book.publisherRef && (
              <Fact
                label={t.publisherLabel}
                value={
                  <Link href={`/nashriyot/${book.publisherRef.slug}`} className="text-accent hover:underline">
                    {book.publisherRef.name}
                  </Link>
                }
              />
            )}
            {!book.publisherRef && book.publisher && <Fact label={t.publisher} value={book.publisher} />}
            {book.page_count && <Fact label={t.pages} value={book.page_count} />}
            {book.published_year && <Fact label={t.year} value={book.published_year} />}
            {book.translator && <Fact label={t.translator} value={book.translator} />}
            {duration && <Fact label={t.duration} value={duration} />}
            {book.narrator && <Fact label={t.narrator} value={book.narrator} />}
            {book.age_limit != null && <Fact label={t.age} value={`${book.age_limit}+`} />}
            {/* yozuv va ISBN nashrga xos — "Qayerdan olish" roʻyxatida har bir nashr yonida */}
          </dl>

          <WhereToGet sources={book.sources} />

          {(book.topics.length > 0 || genres.length > 0) && (
            <div className="mt-5 flex flex-wrap gap-2">
              {book.topics.map((tp) => (
                <Link key={tp.slug} href={`/kitoblar?rukn=${tp.slug}`}>
                  <Badge className="hover:text-text">{tp.name}</Badge>
                </Link>
              ))}
              {genres.map((g) => (
                <Badge key={g.slug}>{g.name}</Badge>
              ))}
            </div>
          )}

          {paragraphs.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 font-serif text-xl font-semibold">{t.about}</h2>
              <div className="space-y-3 leading-relaxed text-text/90">
                {paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          )}

          {book.audio_chapters && book.audio_chapters.length > 1 && (
            <details className="mt-8 rounded-xl border border-border bg-surface">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{t.chapters(book.audio_chapters.length)}</summary>
              <ol className="divide-y divide-border border-t border-border text-sm">
                {book.audio_chapters.map((c, i) => (
                  <li key={i} className="flex justify-between gap-4 px-4 py-2">
                    <span>{c.title}</span>
                    <span className="shrink-0 text-muted">{formatDuration(c.seconds)}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}

          {book.sources.length > 0 && (
            <p className="mt-8 text-xs text-muted">{t.source([...new Set(book.sources.map((s) => SOURCE_NAMES[s.source]))].join(", "))}</p>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        <MyBookSection book={book} />
      </Suspense>

      <Suspense fallback={null}>
        <ReadersSection bookId={book.id} />
      </Suspense>

      <Suspense fallback={null}>
        <SameAuthor book={book} />
      </Suspense>
    </>
  );
}

function BookSkeleton() {
  return (
    <div className="grid gap-8 md:grid-cols-[240px_1fr] lg:gap-12" aria-hidden>
      <div className="mx-auto aspect-[520/697] w-48 animate-pulse rounded-lg bg-surface-2 md:w-full" />
      <div className="space-y-4">
        <div className="h-9 w-3/4 animate-pulse rounded bg-surface-2" />
        <div className="h-5 w-1/3 animate-pulse rounded bg-surface-2" />
        <div className="h-24 animate-pulse rounded bg-surface-2" />
      </div>
    </div>
  );
}

export default function BookPage(props: PageProps<"/kitob/[slug]">) {
  return (
    <Container className="py-8 sm:py-12">
      <Suspense fallback={<BookSkeleton />}>
        <BookView params={props.params} />
      </Suspense>
    </Container>
  );
}
