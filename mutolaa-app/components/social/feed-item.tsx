import Link from "next/link";
import { BookCover } from "@/components/book/book-cover";
import { Avatar } from "@/components/social/avatar";
import { timeAgo } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { personName, type FeedItem } from "@/lib/social";

// Lentadagi bitta voqea: kim, nima qildi, qaysi kitob. Lenta sahifasi va bosh sahifada ishlatiladi.
export function FeedItemCard({ item, now }: { item: FeedItem; now: number }) {
  const name = personName(item.person);
  const t = uz.social;
  return (
    <li className="flex gap-3 rounded-2xl border border-border bg-surface p-4">
      <Link href={`/u/${item.person.username}`} className="shrink-0">
        <Avatar name={name} src={item.person.avatar_url} size={40} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <Link href={`/u/${item.person.username}`} className="font-semibold hover:text-accent">
            {name}
          </Link>{" "}
          <span className="text-muted">{t.kind[item.kind]}</span>
          {item.rating && (item.kind === "rated" || item.kind === "read") ? (
            <span className="ml-1 text-warning">★ {Number(item.rating).toFixed(1)}</span>
          ) : null}
        </p>
        <Link href={`/kitob/${item.book.slug}`} className="mt-2 flex items-center gap-3 rounded-lg p-1 -m-1 hover:bg-surface-2">
          <BookCover src={item.book.cover_url} title={item.book.title} sizes="40px" className="w-10 shrink-0" />
          <span className="min-w-0">
            <span className="line-clamp-1 text-sm font-medium">{item.book.title}</span>
            {item.book.author_names && <span className="line-clamp-1 text-xs text-muted">{item.book.author_names}</span>}
          </span>
        </Link>
        <p className="mt-2 text-xs text-muted">{timeAgo(item.created_at, now, t.ago)}</p>
      </div>
    </li>
  );
}
