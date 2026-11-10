import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/social/avatar";
import { FeedItemCard } from "@/components/social/feed-item";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/i18n/uz";
import { getFeed, personName, searchPublicUsers } from "@/lib/social";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: uz.social.feedTitle };

async function Feed({ searchParams }: { searchParams: PageProps<"/lenta">["searchParams"] }) {
  const sp = await searchParams;
  const scope = sp.tab === "hammasi" ? "all" : "following";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const [{ items, now }, foundUsers] = await Promise.all([getFeed(scope), q ? searchPublicUsers(q) : Promise.resolve([])]);
  const t = uz.social;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
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

        <form action="/lenta" className="flex flex-1 gap-2 sm:max-w-sm">
          {scope === "all" && <input type="hidden" name="tab" value="hammasi" />}
          <Input type="search" name="q" defaultValue={q} placeholder={t.searchUsersPlaceholder} aria-label={t.searchUsersPlaceholder} />
          <Button type="submit" variant="secondary">
            {uz.catalog.searchButton}
          </Button>
        </form>
      </div>

      {q && (
        <div className="mb-6 rounded-2xl border border-border bg-surface p-4">
          {foundUsers.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {foundUsers.map((u) => {
                const uName = personName(u);
                return (
                  <li key={u.id}>
                    <Link href={`/u/${u.username}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2">
                      <Avatar name={uName} src={u.avatar_url} size={36} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{uName}</p>
                        <p className="truncate text-xs text-muted">@{u.username}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t.noUsersFound}</p>
          )}
        </div>
      )}
      {items.length > 0 ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <FeedItemCard key={item.id} item={item} now={now} />
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
