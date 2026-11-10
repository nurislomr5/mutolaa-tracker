import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { getTopics } from "@/lib/catalog";
import { uz } from "@/lib/i18n/uz";
import { getOnboarding } from "@/lib/onboarding";
import { getProfile } from "@/lib/shelf";
import { getSessionUser } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: uz.onboarding.title, robots: { index: false } };

// Yangi foydalanuvchi birinchi kirganda shu yerga tushadi; keyin sozlamalardan qayta ochib oʻzgartirish mumkin
async function Onboarding() {
  if (!(await getSessionUser())) redirect("/kirish?next=/tanishuv");
  const [topics, state, profile] = await Promise.all([getTopics(), getOnboarding(), getProfile()]);
  const isNew = !state?.onboarded;
  const t = uz.onboarding;
  return (
    <>
      <h1 className="font-serif text-3xl font-semibold">{isNew ? t.title : t.editTitle}</h1>
      <p className="mb-8 mt-2 text-muted">{isNew ? t.intro : t.editIntro}</p>
      <OnboardingForm
        // eng koʻp kitobli ruknlar boshida
        topics={[...topics].sort((a, b) => b.count - a.count).map(({ id, name }) => ({ id, name }))}
        selected={state?.topicIds ?? []}
        goal={profile?.yearly_goal ?? null}
        isNew={isNew}
      />
    </>
  );
}

export default function OnboardingPage() {
  return (
    <Container className="max-w-3xl py-8 sm:py-12">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface-2" />}>
        <Onboarding />
      </Suspense>
    </Container>
  );
}
