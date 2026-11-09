import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookCover } from "@/components/book/book-cover";
import { InstallBanner } from "@/components/pwa/install-app";
import { DeleteShelfButton } from "@/components/shelf/delete-shelf-button";
import { ExportShelfCsvButton } from "@/components/shelf/export-buttons";
import { ProgressForm } from "@/components/shelf/progress-form";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { formatDate } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { getShelfItems, getShelves, getStatusCounts, STATUSES, type ShelfItem, type ShelfStatus } from "@/lib/shelf";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: uz.shelf.title };

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
        active ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface text-muted hover:text-text",
      )}
    >
      {children}
    </Link>
  );
}

function Item({ item }: { item: ShelfItem }) {
  const { book } = item;
  return (
    <li className="flex gap-4 rounded-2xl border border-border bg-surface p-4">
      <Link href={`/kitob/${book.slug}`} className="w-16 shrink-0 sm:w-20">
        <BookCover src={book.cover_url} title={book.title} sizes="80px" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/kitob/${book.slug}`} className="font-semibold leading-snug hover:text-accent">
          {book.title}
        </Link>
        {book.author_names && <p className="text-sm text-muted">{book.author_names}</p>}

        {item.status === "reading" && (
          <div className="mt-3 max-w-md">
            <ProgressForm userBook={item} compact />
          </div>
        )}
        {item.status === "read" && (
          <p className="mt-2 text-sm text-muted">
            {item.rating ? <span className="text-warning">★ {item.rating.toFixed(1)}</span> : null}
            {item.rating && item.finished_at ? " · " : ""}
            {item.finished_at && `${uz.shelf.finished}: ${formatDate(item.finished_at)}`}
          </p>
        )}
        {item.status === "dnf" && item.total_value ? (
          <p className="mt-2 text-sm text-muted">
            {item.current_value} / {item.total_value} {uz.shelf.unit[item.unit]}
          </p>
        ) : null}
      </div>
    </li>
  );
}

async function ShelfView({ searchParams }: { searchParams: PageProps<"/javonim">["searchParams"] }) {
  const sp = await searchParams;
  const shelfId = typeof sp.javon === "string" && /^\d+$/.test(sp.javon) ? Number(sp.javon) : undefined;
  const status: ShelfStatus | undefined = shelfId
    ? undefined
    : STATUSES.includes(sp.holat as ShelfStatus)
      ? (sp.holat as ShelfStatus)
      : "reading";

  const [counts, shelves, items] = await Promise.all([getStatusCounts(), getShelves(), getShelfItems({ status, shelfId })]);
  const activeShelf = shelves.find((s) => s.id === shelfId);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {STATUSES.map((s) => (
            <Tab key={s} href={`/javonim?holat=${s}`} active={status === s}>
              {uz.status[s]} <span className="text-xs opacity-70">{counts[s]}</span>
            </Tab>
          ))}
        </div>
        <ExportShelfCsvButton items={items} />
      </div>

      {shelves.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{uz.shelf.customShelves}</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {shelves.map((s) => (
              <Tab key={s.id} href={`/javonim?javon=${s.id}`} active={shelfId === s.id}>
                {s.name} <span className="text-xs opacity-70">{s.count}</span>
              </Tab>
            ))}
          </div>
        </div>
      )}

      {activeShelf && (
        <div className="mt-6 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold">{activeShelf.name}</h2>
          <DeleteShelfButton shelfId={activeShelf.id} />
        </div>
      )}

      {items.length > 0 ? (
        <ul className="mt-6 grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <Item key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <div className="py-16 text-center">
          <p className="text-muted">{status ? uz.shelf.empty[status] : uz.catalog.empty}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/kitoblar" className={buttonClasses()}>
              {uz.shelf.findBooks}
            </Link>
            <Link href="/kitob-qoshish" className={buttonClasses({ variant: "secondary" })}>
              {uz.addBook.ctaShort}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

export default function ShelfPage(props: PageProps<"/javonim">) {
  return (
    <Container className="py-8 sm:py-10">
      <h1 className="mb-6 font-serif text-3xl font-semibold">{uz.shelf.title}</h1>
      <InstallBanner />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
        <ShelfView searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
