import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookGrid } from "@/components/book/book-card";
import { ReviewText } from "@/components/shelf/review-form";
import { Avatar } from "@/components/social/avatar";
import { FollowButton } from "@/components/social/follow-button";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { formatDate } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { getPublicProfile, personName } from "@/lib/social";

export const metadata: Metadata = { title: uz.social.readBooks };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 font-serif text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

async function ProfileView({ params }: { params: PageProps<"/u/[username]">["params"] }) {
  const { username } = await params;
  const data = await getPublicProfile(decodeURIComponent(username));
  if (!data) notFound();
  const { profile } = data;
  const t = uz.social;
  const name = personName(profile);

  return (
    <>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar name={name} src={profile.avatar_url} size={80} />
        <div className="flex-1">
          <h1 className="font-serif text-3xl font-semibold">{name}</h1>
          <p className="text-muted">@{profile.username}</p>
          <p className="mt-1 text-sm text-muted">
            {t.followers(data.followers)} · {t.followingCount(data.following)}
          </p>
          {data.tasteMatch && (
            <div className="mt-2">
              <Badge tone="accent">🤝 {t.commonBooks(data.tasteMatch.common, data.tasteMatch.pct)}</Badge>
            </div>
          )}
        </div>
        {data.isSelf ? (
          <Link href="/sozlamalar" className={buttonClasses({ variant: "secondary" })}>
            {t.editProfile}
          </Link>
        ) : data.isLoggedIn ? (
          <FollowButton profileId={profile.id} following={data.isFollowing} />
        ) : (
          <Link href={`/kirish?next=${encodeURIComponent(`/u/${profile.username}`)}`} className={buttonClasses()}>
            {t.loginToFollow}
          </Link>
        )}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 sm:max-w-md">
        {[
          [t.readTotal, data.read.length],
          [t.readThisYear, data.readThisYear],
          [t.want, data.wantCount],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>

      {data.reading.length > 0 && (
        <Section title={t.nowReading}>
          <BookGrid books={data.reading} />
        </Section>
      )}

      {data.reviews.length > 0 && (
        <Section title={t.reviews}>
          <ul className="grid gap-3 lg:grid-cols-2">
            {data.reviews.map((r) => (
              <li key={r.book.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/kitob/${r.book.slug}`} className="font-semibold hover:text-accent">
                    {r.book.title}
                  </Link>
                  {r.rating && <span className="shrink-0 text-sm text-warning">★ {Number(r.rating).toFixed(1)}</span>}
                </div>
                <ReviewText review={r.review} isSpoiler={r.isSpoiler} className="mt-2 line-clamp-6 whitespace-pre-line text-sm" />
                <p className="mt-2 text-xs text-muted">{formatDate(r.date)}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.read.length > 0 && (
        <Section title={t.readBooks}>
          <BookGrid books={data.read} />
        </Section>
      )}
    </>
  );
}

export default function PublicProfilePage(props: PageProps<"/u/[username]">) {
  return (
    <Container className="py-8 sm:py-12">
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
        <ProfileView params={props.params} />
      </Suspense>
    </Container>
  );
}
