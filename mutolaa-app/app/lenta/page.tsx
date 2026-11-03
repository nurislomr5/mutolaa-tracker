import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookCover } from "@/components/book/book-cover";
import { Avatar } from "@/components/social/avatar";
import { Container } from "@/components/ui/container";
import { timeAgo } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { getFeed, personName, type FeedItem } from "@/lib/social";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: uz.social.feedTitle };

function Item({ item, now }: { item: FeedItem; now: number }) {
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

async function Feed({ searchParams }: { searchParams: PageProps<"/lenta">["searchParams"] }) {
  const sp = await searchParams;
  const scope = sp.tab === "hammasi" ? "all" : "following";
  const { items, now } = await getFeed(scope);
  const t = uz.social;

  return (
    <>
      <div className="mb-6 flex gap-2">
        {[
          ["following", "/lenta", t.tabFollowing],
          ["all", "/lenta?tab=hammasi", t.tabAll],
        ].map(([key, href, label]) => (
          <Link
            key={key}
            href={href}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              scope === key ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface text-muted hover:text-text",
            )}
          >
            {label}
          </Link>
        ))}
      </div>
      {items.length > 0 ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <Item key={item.id} item={item} now={now} />
          ))}
        </ul>
      ) : (
        <p className="py-16 text-center text-muted">
          {scope === "following" ? t.feedEmptyFollowing : t.feedEmptyAll}
        </p>
      )}
    </>
  );
}

export default function FeedPage(props: PageProps<"/lenta">) {
  return (
    <Container className="py-8 sm:py-10">
      <h1 className="font-serif text-3xl font-semibold">{uz.social.feedTitle}</h1>
      <p className="mb-6 mt-1 text-muted">{uz.social.feedSubtitle}</p>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
        <Feed searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
