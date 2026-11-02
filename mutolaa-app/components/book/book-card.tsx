import Link from "next/link";
import { BookCover } from "@/components/book/book-cover";
import { FormatIcon } from "@/components/book/format-icons";
import type { BookCardData } from "@/lib/catalog";
import { formatRating } from "@/lib/format";

export function BookCard({ book, priority }: { book: BookCardData; priority?: boolean }) {
  const rating = formatRating(book.mutolaa_rating);
  return (
    <Link href={`/kitob/${book.slug}`} className="group flex flex-col gap-2">
      <BookCover src={book.cover_url} title={book.title} priority={priority} className="transition-transform group-hover:-translate-y-0.5" />
      <div className="min-w-0">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-accent">{book.title}</h3>
        {book.author_names && <p className="mt-0.5 line-clamp-1 text-xs text-muted">{book.author_names}</p>}
        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
          {book.formats.map((f) => (
            <FormatIcon key={f} format={f} className="h-3.5 w-3.5" />
          ))}
          {rating && <span>★ {rating}</span>}
        </div>
      </div>
    </Link>
  );
}

export function BookGrid({ books, priorityCount = 0 }: { books: BookCardData[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {books.map((b, i) => (
        <BookCard key={b.id} book={b} priority={i < priorityCount} />
      ))}
    </div>
  );
}

export function BookGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="aspect-[520/697] animate-pulse rounded-lg bg-surface-2" />
          <div className="h-3.5 w-4/5 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
