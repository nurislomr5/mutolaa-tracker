import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { BookGrid, BookGridSkeleton } from "@/components/book/book-card";
import { FormatIcon } from "@/components/book/format-icons";
import { Button, buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { getCatalog, getPublisher, getTopics, PAGE_SIZE, type BookFormat, type CatalogQuery, type CatalogSort } from "@/lib/catalog";
import { formatCount } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: uz.catalog.title,
  description: uz.catalog.description,
};

const SORTS: CatalogSort[] = ["relevance", "popular", "rating", "new", "title"];
const FORMATS: BookFormat[] = ["paper", "ebook", "audio"];

type SearchParams = Record<string, string | string[] | undefined>;

function parseQuery(sp: SearchParams): CatalogQuery {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k])?.trim() || undefined;
  const topic = one("rukn");
  const publisher = one("nashriyot");
  const format = one("format");
  const sort = one("sort");
  const page = Number(one("sahifa") ?? 1);
  return {
    q: one("q")?.slice(0, 100),
    topic: topic && /^[a-z0-9-]{1,80}$/.test(topic) ? topic : undefined,
    publisher: publisher && /^[a-z0-9-]{1,80}$/.test(publisher) ? publisher : undefined,
    format: FORMATS.includes(format as BookFormat) ? (format as BookFormat) : undefined,
    sort: SORTS.includes(sort as CatalogSort) ? (sort as CatalogSort) : undefined,
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

// Joriy filtrlarni saqlagan holda bittasini oʻzgartirib havola yasash (sahifa 1 ga qaytadi)
function catalogHref(q: CatalogQuery, patch: Partial<CatalogQuery>) {
  const next = { ...q, page: undefined, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.topic) params.set("rukn", next.topic);
  if (next.publisher) params.set("nashriyot", next.publisher);
  if (next.format) params.set("format", next.format);
  if (next.sort) params.set("sort", next.sort);
  if (next.page && next.page > 1) params.set("sahifa", String(next.page));
  const s = params.toString();
  return s ? `/kitoblar?${s}` : "/kitoblar";
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
        active ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface text-muted hover:text-text",
      )}
    >
      {children}
    </Link>
  );
}

async function Catalog({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = parseQuery(await searchParams);
  const [topics, { books, total }, publisher] = await Promise.all([
    getTopics(),
    getCatalog(query),
    query.publisher ? getPublisher(query.publisher) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = query.page ?? 1;
  const hasFilters = Boolean(query.q || query.topic || query.publisher || query.format || query.sort);
  const t = uz.catalog;

  return (
    <>
      <Form action="/kitoblar" className="flex flex-col gap-3 sm:flex-row">
        <Input name="q" type="search" defaultValue={query.q} placeholder={t.searchPlaceholder} className="h-11 sm:flex-1" />
        {query.topic && <input type="hidden" name="rukn" value={query.topic} />}
        {query.format && <input type="hidden" name="format" value={query.format} />}
        {query.publisher && <input type="hidden" name="nashriyot" value={query.publisher} />}
        <select
          name="sort"
          defaultValue={query.sort ?? ""}
          aria-label={t.sortLabel}
          className="h-11 rounded-lg border border-border bg-surface px-3 text-sm"
        >
          <option value="">
            {t.sortLabel}: {query.q ? t.sort.relevance : t.sort.popular}
          </option>
          {SORTS.filter((s) => s !== "relevance").map((s) => (
            <option key={s} value={s}>
              {t.sort[s]}
            </option>
          ))}
        </select>
        <Button type="submit" size="lg">
          {t.search}
        </Button>
      </Form>

      <div className="mt-4 flex flex-wrap gap-2">
        {publisher && (
          <Chip href={catalogHref(query, { publisher: undefined })} active>
            {t.publisherFilter(publisher.name)} ✕
          </Chip>
        )}
        <Chip href={catalogHref(query, { format: undefined })} active={!query.format}>
          {t.anyFormat}
        </Chip>
        {FORMATS.map((f) => (
          <Chip key={f} href={catalogHref(query, { format: f })} active={query.format === f}>
            <FormatIcon format={f} className="h-3.5 w-3.5" />
            {uz.format[f]}
          </Chip>
        ))}
      </div>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip href={catalogHref(query, { topic: undefined })} active={!query.topic}>
          {t.allTopics}
        </Chip>
        {topics.map((tp) => (
          <Chip key={tp.slug} href={catalogHref(query, { topic: tp.slug })} active={query.topic === tp.slug}>
            {tp.name}
            <span className="text-xs opacity-70">{tp.count}</span>
          </Chip>
        ))}
      </div>

      <div className="mb-5 mt-6 flex items-center justify-between text-sm text-muted">
        <span>{t.total(formatCount(total))}</span>
        {hasFilters && (
          <Link href="/kitoblar" className="text-accent hover:underline">
            {t.clear}
          </Link>
        )}
      </div>

      {books.length ? (
        <BookGrid books={books} priorityCount={6} />
      ) : (
        <div className="py-16 text-center">
          <p className="text-muted">{t.empty}</p>
          <Link
            href={query.q ? `/kitob-qoshish?nom=${encodeURIComponent(query.q)}` : "/kitob-qoshish"}
            className={buttonClasses({ className: "mt-6" })}
          >
            {uz.addBook.cta}
          </Link>
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Sahifalar">
          {page > 1 ? (
            <Link href={catalogHref(query, { page: page - 1 })} className={buttonClasses({ variant: "secondary" })}>
              {t.prev}
            </Link>
          ) : (
            <span className={buttonClasses({ variant: "secondary", className: "pointer-events-none opacity-40" })}>{t.prev}</span>
          )}
          <span className="text-sm text-muted">{t.pageOf(page, pages)}</span>
          {page < pages ? (
            <Link href={catalogHref(query, { page: page + 1 })} className={buttonClasses({ variant: "secondary" })}>
              {t.next}
            </Link>
          ) : (
            <span className={buttonClasses({ variant: "secondary", className: "pointer-events-none opacity-40" })}>{t.next}</span>
          )}
        </nav>
      )}
    </>
  );
}

export default function CatalogPage(props: PageProps<"/kitoblar">) {
  return (
    <Container className="py-8 sm:py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl font-semibold">{uz.catalog.title}</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/kitob-qoshish" className="text-accent hover:underline">
            {uz.addBook.ctaShort}
          </Link>
          <Link href="/nashriyotlar" className="text-accent hover:underline">
            {uz.publishers.allPublishers}
          </Link>
        </div>
      </div>
      <p className="mb-6 mt-1 text-muted">{uz.catalog.description}</p>
      <Suspense
        fallback={
          <>
            <div className="mb-24 h-11 animate-pulse rounded-lg bg-surface-2" />
            <BookGridSkeleton />
          </>
        }
      >
        <Catalog searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
