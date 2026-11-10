import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BookCover } from "@/components/book/book-cover";
import { Avatar } from "@/components/social/avatar";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { timeAgo } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { getNotifications, type Notification } from "@/lib/notifications";
import { addDays } from "@/lib/stats-utils";
import { getSessionUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { MarkRead } from "./mark-read";

export const metadata: Metadata = { title: uz.notifications.title, robots: { index: false } };

function Emoji({ children }: { children: string }) {
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg" aria-hidden>
      {children}
    </span>
  );
}

// Har bir tur uchun: chapdagi belgi, matn, qoʻshimcha satr va bosilganda ochiladigan manzil
function describe(item: Notification): { icon: React.ReactNode; text: string; detail?: string | null; href?: string } {
  const t = uz.notifications;
  switch (item.kind) {
    case "follow":
      // yopiq profilli kuzatuvchining kimligi koʻrsatilmaydi
      return item.actor_name
        ? {
            icon: <Avatar name={item.actor_name} src={item.actor_avatar} size={40} />,
            text: t.follow(item.actor_name),
            href: item.actor_username ? `/u/${item.actor_username}` : undefined,
          }
        : { icon: <Emoji>👤</Emoji>, text: t.followPrivate };
    case "helpful":
      return { icon: <Emoji>👍</Emoji>, text: t.helpful(item.n), detail: item.book_title, href: `/kitob/${item.book_slug}` };
    case "club_post":
      return { icon: <Emoji>💬</Emoji>, text: t.clubPost(item.club_name ?? "", item.n), href: `/klub/${item.club_slug}` };
    case "club_reply":
      return {
        icon: <Avatar name={item.actor_name ?? t.clubMember} src={item.actor_avatar} size={40} />,
        text: t.clubReply(item.actor_name ?? t.clubMember, item.club_name ?? ""),
        href: `/klub/${item.club_slug}`,
      };
    case "new_book":
      return {
        icon: <BookCover src={item.book_cover} title={item.book_title ?? ""} sizes="40px" className="w-10 shrink-0" />,
        text: t.newBook,
        detail: item.book_title,
        href: `/kitob/${item.book_slug}`,
      };
    case "weekly":
      return {
        icon: <Emoji>📊</Emoji>,
        text: t.weekly,
        detail: item.ref_date ? uz.week.range(item.ref_date, addDays(item.ref_date, 6)) : null,
        href: item.ref_date ? `/hafta?h=${item.ref_date}` : "/hafta",
      };
  }
}

function Row({ item, now }: { item: Notification; now: number }) {
  const { icon, text, detail, href } = describe(item);
  const className = cn(
    "flex items-center gap-3 rounded-2xl border p-4",
    item.unread ? "border-accent/40 bg-accent/5" : "border-border bg-surface",
    href && "transition-colors hover:bg-surface-2",
  );
  const body = (
    <>
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{text}</p>
        {detail && <p className="line-clamp-1 text-sm text-muted">{detail}</p>}
        <p className="mt-1 text-xs text-muted">{timeAgo(item.created_at, now, uz.social.ago)}</p>
      </div>
      {item.unread && <Badge tone="accent">{uz.notifications.unreadMark}</Badge>}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={className}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}

async function List() {
  if (!(await getSessionUser())) redirect("/kirish?next=/bildirishnomalar");
  // oʻqilmaganlar soni ham shuncha yozuv ichidan sanaladi (unread_notifications_count)
  const result = await getNotifications(100);
  if (!result) return <p className="py-10 text-center text-muted">{uz.notifications.unavailable}</p>;
  if (!result.items.length) return <p className="py-10 text-center text-muted">{uz.notifications.empty}</p>;
  return (
    <>
      {result.items.some((item) => item.unread) && <MarkRead />}
      <ul className="grid gap-3">
        {result.items.map((item) => (
          <Row key={`${item.kind}-${item.id}`} item={item} now={result.now} />
        ))}
      </ul>
    </>
  );
}

export default function NotificationsPage() {
  const t = uz.notifications;
  return (
    <Container className="max-w-2xl py-8 sm:py-10">
      <h1 className="font-serif text-3xl font-semibold">{t.title}</h1>
      <p className="mb-6 mt-2 text-muted">{t.intro}</p>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
        <List />
      </Suspense>
    </Container>
  );
}
