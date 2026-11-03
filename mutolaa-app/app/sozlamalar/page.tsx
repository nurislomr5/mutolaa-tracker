import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut } from "@/app/kirish/actions";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { uz } from "@/lib/i18n/uz";
import { getProfile, isTelegramLinked } from "@/lib/shelf";
import { getSessionUser } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";
import { TelegramLink } from "./telegram-link";

export const metadata: Metadata = { title: uz.settings.title };

async function Settings() {
  const user = await getSessionUser();
  if (!user) redirect("/kirish?next=/sozlamalar");
  const [profile, telegramLinked] = await Promise.all([getProfile(), isTelegramLinked()]);
  const t = uz.settings;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle>{t.profile}</CardTitle>
        <p className="mb-5 mt-1 text-sm text-muted">{user.email}</p>
        {profile && <ProfileForm profile={profile} />}
      </Card>
      <div className="space-y-4">
        <Card>
          <CardTitle>{t.telegram}</CardTitle>
          <p className="mb-4 mt-2 text-sm text-muted">{t.telegramIntro}</p>
          <TelegramLink linked={telegramLinked} />
        </Card>
        <Card>
          <CardTitle>{uz.auth.account}</CardTitle>
          <form action={signOut} className="mt-4">
            <Button type="submit" variant="secondary">
              {uz.auth.signOut}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Container className="py-8 sm:py-10">
      <h1 className="mb-6 font-serif text-3xl font-semibold">{uz.settings.title}</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
        <Settings />
      </Suspense>
    </Container>
  );
}
