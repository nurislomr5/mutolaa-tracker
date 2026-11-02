import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { uz } from "@/lib/i18n/uz";
import { safeNext } from "@/lib/safe-next";
import { getSessionUser } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: uz.auth.title };

async function Login({ searchParams }: { searchParams: PageProps<"/kirish">["searchParams"] }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  if (await getSessionUser()) redirect(next);
  const initialError = sp.xato ? uz.auth.failed : undefined;
  return <LoginForm next={next} initialError={initialError} />;
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
      </Card>
    </Container>
  );
}
