import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { uz } from "@/lib/i18n/uz";
import { safeNext } from "@/lib/safe-next";
import { getSessionUser } from "@/lib/supabase/server";
import { getBotUsername } from "@/lib/bot/telegram";
import { LoginForm } from "./login-form";

// Supabase'da yoqilgan tashqi provayderlar (Google yoqilmagan boʻlsa tugma koʻrsatilmaydi)
async function googleEnabled() {
  "use cache";
  cacheLife("hours");
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    });
    const data = await res.json();
    return Boolean(data?.external?.google);
  } catch {
    return false;
  }
}

export const metadata: Metadata = { title: uz.auth.title };

async function Login({ searchParams }: { searchParams: PageProps<"/kirish">["searchParams"] }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  if (await getSessionUser()) redirect(next);
  const initialError = sp.xato ? uz.auth.failed : undefined;
  const [google, bot] = await Promise.all([googleEnabled(), getBotUsername()]);
  return (
    <LoginForm next={next} initialError={initialError} googleEnabled={google} telegramUrl={bot ? `https://t.me/${bot}?start=login` : null} />
  );
}

export default function LoginPage(props: PageProps<"/kirish">) {
  return (
    <Container className="flex justify-center py-12 sm:py-20">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="font-serif text-2xl font-semibold">{uz.auth.title}</h1>
        <p className="mb-6 mt-2 text-sm text-muted">{uz.auth.subtitle}</p>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-surface-2" />}>
          <Login searchParams={props.searchParams} />
        </Suspense>
        <p className="mt-6 text-center text-xs leading-relaxed text-muted">
          {uz.auth.consentBefore}
          <Link href="/shartlar" className="underline hover:text-text">
            {uz.auth.consentTerms}
          </Link>
          {uz.auth.consentAnd}
          <Link href="/maxfiylik" className="underline hover:text-text">
            {uz.auth.consentPrivacy}
          </Link>
          {uz.auth.consentAfter}
        </p>
      </Card>
    </Container>
  );
}
