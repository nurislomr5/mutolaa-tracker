import type { Metadata } from "next";
import Form from "next/form";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { getAdminUser } from "@/lib/admin";
import { getDuplicatePairs, getPairBySlugs } from "@/lib/admin-books";
import { uz } from "@/lib/i18n/uz";
import { AdminNav } from "../admin-nav";
import { PairCard } from "./pair-card";

export const metadata: Metadata = { title: uz.admin.duplicatesTitle, robots: { index: false } };

// Takroriy kitoblar: avtomatik topilgan juftliklar va qoʻlda tanlangan ikki kitob (?a=…&b=…). Faqat admin.
async function Duplicates({ searchParams }: { searchParams: PageProps<"/admin/takrorlar">["searchParams"] }) {
  if (!(await getAdminUser())) notFound();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 300) : "");
  const [manualA, manualB] = [one("a"), one("b")];
  const t = uz.admin;

  const [manual, pairs] = await Promise.all([manualA && manualB ? getPairBySlugs(manualA, manualB) : Promise.resolve(null), getDuplicatePairs()]);

  return (
    <>
      <Form action="/admin/takrorlar" className="mb-8 rounded-2xl border border-border bg-surface p-4">
        <p className="font-medium">{t.manualTitle}</p>
        <p className="mb-3 text-xs text-muted">{t.manualHint}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input name="a" defaultValue={manualA} placeholder={t.manualFirst} aria-label={t.manualFirst} className="sm:flex-1" />
          <Input name="b" defaultValue={manualB} placeholder={t.manualSecond} aria-label={t.manualSecond} className="sm:flex-1" />
          <Button type="submit" variant="secondary">
            {t.manualShow}
          </Button>
        </div>
        {manualA && manualB && !manual && <p className="mt-2 text-sm text-danger">{t.manualNotFound}</p>}
      </Form>

      <ul className="space-y-4">
        {manual && <PairCard key={`m-${manual.a.id}-${manual.b.id}`} pair={manual} />}
        {pairs.map((p) => (
          <PairCard key={`${p.a.id}-${p.b.id}`} pair={p} />
        ))}
      </ul>
      {!pairs.length && !manual && <p className="py-10 text-center text-muted">{t.none}</p>}
    </>
  );
}

export default function DuplicatesPage(props: PageProps<"/admin/takrorlar">) {
  return (
    <Container className="py-8 sm:py-10">
      <h1 className="font-serif text-3xl font-semibold">{uz.admin.duplicatesTitle}</h1>
      <p className="mb-5 mt-1 max-w-3xl text-sm text-muted">{uz.admin.duplicatesIntro}</p>
      <AdminNav current="duplicates" />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
        <Duplicates searchParams={props.searchParams} />
      </Suspense>
    </Container>
  );
}
