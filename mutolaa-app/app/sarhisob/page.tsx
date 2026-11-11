import type { Metadata } from "next";
import { Suspense } from "react";
import { WrapUpView } from "@/components/stats/wrapup-view";
import { Container } from "@/components/ui/container";
import { uz } from "@/lib/i18n/uz";
import { getProfile } from "@/lib/shelf";
import { getYearStats } from "@/lib/stats";
import { buildWrapUp } from "@/lib/wrapup";

// Yil sarhisobi — foydalanuvchining shaxsiy sahifasi (faqat oʻzi koʻradi); ulashish rasm orqali
export const metadata: Metadata = { title: uz.wrapup.metaTitle, robots: { index: false } };

async function WrapUp({ searchParams }: { searchParams: PageProps<"/sarhisob">["searchParams"] }) {
  const sp = await searchParams;
  const requested = typeof sp.yil === "string" && /^\d{4}$/.test(sp.yil) ? Number(sp.yil) : undefined;
  const [stats, profile] = await Promise.all([getYearStats(requested), getProfile()]);
  return <WrapUpView wrap={buildWrapUp(stats)} reader={profile?.display_name || profile?.username || null} years={stats.years} />;
}

export default function WrapUpPage(props: PageProps<"/sarhisob">) {
  return (
    <Container className="py-8 sm:py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-surface-2" />}>
        <WrapUp searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
