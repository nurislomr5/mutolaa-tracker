import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookCover } from "@/components/book/book-cover";
import { Avatar } from "@/components/social/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { getClub, getClubMembers, getClubThreads, memberProgress, type ClubMember, type ClubPage, type ClubPost } from "@/lib/clubs";
import { formatDate } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { siteUrl } from "@/lib/site";
import { getSessionUser } from "@/lib/supabase/server";
import { ClubForm } from "../../klublar/club-form";
import { BookPicker, DeleteClubButton, DeletePostButton, InvitePanel, JoinButton, LeaveButton, PostForm, RemoveMemberButton, ReplyToggle } from "./club-client";

const t = uz.clubs;

export async function generateMetadata({ params }: PageProps<"/klub/[slug]">): Promise<Metadata> {
  const club = await getClub((await params).slug);
  if (!club) return { title: uz.notFound.title, robots: { index: false } };
  return {
    title: club.name,
    description: club.description ?? t.intro,
    // yopiq klub qidiruv tizimlariga koʻrinmaydi (u yerga baribir faqat aʼzolar kira oladi)
    robots: club.is_public ? undefined : { index: false },
  };
}

function MemberRow({ m, club, canRemove }: { m: ClubMember; club: ClubPage; canRemove: boolean }) {
  const { label, pct } = memberProgress(m);
  const status = !club.book_id ? null : m.status === "want" ? t.wantStatus : m.status === "dnf" ? t.dnfStatus : !m.status ? t.notStarted : null;
  const name = m.display_name;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Avatar name={name} src={m.avatar_url} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {m.username ? (
            <Link href={`/u/${m.username}`} className="font-medium hover:text-accent">
              {name}
            </Link>
          ) : (
            <span className="font-medium">{name}</span>
          )}
          {m.role === "owner" && <span className="ml-1.5 text-xs text-muted">· {t.owner}</span>}
        </p>
        {club.book_id && (
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            {pct != null && (
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
              </span>
            )}
            <span>{label ?? status}</span>
          </div>
        )}
      </div>
      {canRemove && m.role !== "owner" && <RemoveMemberButton clubId={club.id} userId={m.user_id} name={name} />}
    </li>
  );
}

function PostView({ post, clubId, canReply }: { post: ClubPost; clubId: number; canReply: boolean }) {
  return (
    <div className="flex gap-3">
      <Avatar name={post.display_name} src={post.avatar_url} size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          {post.username ? (
            <Link href={`/u/${post.username}`} className="font-semibold hover:text-accent">
              {post.display_name}
            </Link>
          ) : (
            <span className="font-semibold">{post.display_name}</span>
          )}
          <span className="ml-2 text-xs text-muted">{formatDate(post.created_at)}</span>
        </p>
        <p className="mt-1 whitespace-pre-line break-words text-sm">{post.body}</p>
        <div className="mt-1 flex gap-4">
          {canReply && <ReplyToggle clubId={clubId} parentId={post.id} />}
          {post.can_delete && <DeletePostButton postId={post.id} />}
        </div>
      </div>
    </div>
  );
}

async function ClubView({ params }: { params: PageProps<"/klub/[slug]">["params"] }) {
  const { slug } = await params;
  const club = await getClub(slug);
  if (!club) notFound();
  const [user, members, threads] = await Promise.all([getSessionUser(), getClubMembers(club.id), getClubThreads(club.id)]);
  const loginHref = `/kirish?next=${encodeURIComponent(`/klub/${club.slug}`)}`;

  return (
    <>
      <div className="mb-8">
        <Link href="/klublar" className="text-sm text-muted hover:text-accent">
          ← {t.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="font-serif text-3xl font-semibold">{club.name}</h1>
          <Badge tone={club.is_public ? "accent" : "warning"}>{club.is_public ? t.publicBadge : t.privateBadge}</Badge>
        </div>
        {club.description && <p className="mt-2 max-w-2xl whitespace-pre-line text-muted">{club.description}</p>}
        <p className="mt-2 text-sm text-muted">{t.members(club.member_count)}</p>
        <div className="mt-4">
          {club.is_member ? (
            !club.is_owner && <LeaveButton clubId={club.id} />
          ) : user ? (
            <JoinButton clubId={club.id} />
          ) : (
            <Link href={loginHref} className="font-medium text-accent hover:underline">
              {t.signInToJoin} →
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardTitle>{t.currentBook}</CardTitle>
            {club.book_slug ? (
              <Link href={`/kitob/${club.book_slug}`} className="mt-3 flex gap-4 hover:text-accent">
                <div className="w-20 shrink-0">
                  <BookCover src={club.book_cover} title={club.book_title ?? ""} sizes="80px" />
                </div>
                <div>
                  <p className="font-semibold">{club.book_title}</p>
                  {club.book_authors && <p className="text-sm text-muted">{club.book_authors}</p>}
                </div>
              </Link>
            ) : (
              <p className="mt-2 text-sm text-muted">{t.noBook}</p>
            )}
            {club.is_owner && <BookPicker clubId={club.id} hasBook={Boolean(club.book_id)} />}
          </Card>

          <section>
            <h2 className="mb-3 font-serif text-xl font-semibold">{t.discussion}</h2>
            {club.is_member ? <PostForm clubId={club.id} /> : <p className="text-sm text-muted">{t.membersOnly}</p>}
            {threads.length ? (
              <ul className="mt-5 space-y-5">
                {threads.map((th) => (
                  <li key={th.id} className="rounded-2xl border border-border bg-surface p-4">
                    <PostView post={th} clubId={club.id} canReply={club.is_member} />
                    {th.replies.length > 0 && (
                      <ul className="ml-11 mt-3 space-y-3 border-l border-border pl-4">
                        {th.replies.map((r) => (
                          <li key={r.id}>
                            <PostView post={r} clubId={club.id} canReply={false} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted">{t.noPosts}</p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardTitle>{t.membersTitle}</CardTitle>
            <ul className="mt-2 divide-y divide-border">
              {members.map((m) => (
                <MemberRow key={m.user_id} m={m} club={club} canRemove={club.is_owner} />
              ))}
            </ul>
          </Card>
          {club.is_owner && club.invite_code && (
            <Card>
              <CardTitle>{t.invite}</CardTitle>
              <div className="mt-2">
                <InvitePanel clubId={club.id} url={`${siteUrl()}/klublar/taklif/${club.invite_code}`} />
              </div>
            </Card>
          )}
          {club.is_owner && (
            <Card>
              <CardTitle>{t.settings}</CardTitle>
              <div className="mt-3">
                <ClubForm club={club} />
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <DeleteClubButton clubId={club.id} />
              </div>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

export default function ClubPageRoute(props: PageProps<"/klub/[slug]">) {
  return (
    <Container className="py-8 sm:py-10">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
        <ClubView params={props.params} />
      </Suspense>
    </Container>
  );
}
