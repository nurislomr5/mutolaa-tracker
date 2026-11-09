import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { getClubByInvite } from "@/lib/clubs";
import { uz } from "@/lib/i18n/uz";
import { getSessionUser } from "@/lib/supabase/server";
import { JoinByCodeButton } from "./join-button";

export const metadata: Metadata = { title: uz.clubs.inviteTitle, robots: { index: false } };

const t = uz.clubs;

// Taklif havolasi: /klublar/taklif/<kod> — yopiq klubga ham shu orqali qoʻshiladi
async function Invite({ params }: { params: PageProps<"/klublar/taklif/[code]">["params"] }) {
  const { code } = await params;
  const valid = /^[0-9a-f]{32}$/.test(code);
  const [club, user] = await Promise.all([valid ? getClubByInvite(code) : Promise.resolve(null), getSessionUser()]);
  if (!club) return <p className="text-muted">{t.inviteInvalid}</p>;
  return (
    <Card className="text-center">
      <p className="text-4xl" aria-hidden>
        📚
      </p>
      <h1 className="mt-3 font-serif text-2xl font-semibold">{club.name}</h1>
      {club.description && <p className="mt-2 whitespace-pre-line text-muted">{club.description}</p>}
      <p className="mt-2 text-sm text-muted">{t.members(club.member_count)}</p>
      <div className="mt-6">
        {club.is_member ? (
          <>
            <p className="text-sm text-muted">{t.alreadyMember}</p>
            <Link href={`/klub/${club.slug}`} className={buttonClasses({ className: "mt-3" })}>
              {t.openClub}
            </Link>
          </>
        ) : user ? (
          <JoinByCodeButton code={code} />
        ) : (
          <Link href={`/kirish?next=${encodeURIComponent(`/klublar/taklif/${code}`)}`} className={buttonClasses()}>
            {t.signInToJoin}
          </Link>
        )}
      </div>
    </Card>
  );
}

export default function InvitePage(props: PageProps<"/klublar/taklif/[code]">) {
  return (
    <Container className="max-w-lg py-12">
      <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-surface-2" />}>
        <Invite params={props.params} />
      </Suspense>
    </Container>
  );
}
