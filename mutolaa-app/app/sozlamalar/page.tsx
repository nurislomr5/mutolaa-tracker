import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut } from "@/app/kirish/actions";
import { Button } from "@/components/ui/button";
import { InstallAppCard } from "@/components/pwa/install-app";
import { Card, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { getAdminUser } from "@/lib/admin";
import { isTelegramEmail } from "@/lib/bot/login";
import { uz } from "@/lib/i18n/uz";
import { getProfile, isTelegramLinked } from "@/lib/shelf";
import { getSessionUser } from "@/lib/supabase/server";
import { DeleteAccount } from "./delete-account";
import { ProfileForm } from "./profile-form";
import { RemindersForm } from "./reminders-form";
import { TelegramLink } from "./telegram-link";

export const metadata: Metadata = { title: uz.settings.title };

async function Settings() {
  const user = await getSessionUser();
  if (!user) redirect("/kirish?next=/sozlamalar");
  const [profile, telegramLinked, admin] = await Promise.all([getProfile(), isTelegramLinked(), getAdminUser()]);
  const t = uz.settings;
  const emailLabel = isTelegramEmail(user.email) ? "Telegram orqali kirgan" : user.email;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle>{t.profile}</CardTitle>
        <p className="mb-5 mt-1 text-sm text-muted">{emailLabel}</p>
        {profile && <ProfileForm profile={profile} />}
      </Card>
      <div className="space-y-4">
        <Card>
          <CardTitle>{t.telegram}</CardTitle>
          <p className="mb-4 mt-2 text-sm text-muted">{t.telegramIntro}</p>
          <TelegramLink linked={telegramLinked} />
        </Card>
        {profile && (
          <Card>
            <CardTitle>{uz.reminders.settingsTitle}</CardTitle>
            <p className="mb-4 mt-2 text-sm text-muted">{uz.reminders.settingsIntro}</p>
            <RemindersForm profile={profile} telegramLinked={telegramLinked} />
          </Card>
        )}
        <Card>
          <CardTitle>{uz.pwa.title}</CardTitle>
          <div className="mt-2">
            <InstallAppCard />
          </div>
        </Card>
        {admin && (
          <Card>
            <Link href="/admin" className="text-sm font-medium text-accent hover:underline">
              {uz.admin.settingsLink}
            </Link>
          </Card>
        )}
        <Card>
          <CardTitle>{uz.auth.account}</CardTitle>
          <form action={signOut} className="mt-4">
            <Button type="submit" variant="secondary">
              {uz.auth.signOut}
            </Button>
          </form>
          <div className="mt-5 border-t border-border pt-4">
            <DeleteAccount />
          </div>
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
