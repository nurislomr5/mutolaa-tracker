import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { getAdminUser } from "@/lib/admin";
import { getOpenBookReports, getOpenContentReports } from "@/lib/admin-panel";
import { uz } from "@/lib/i18n/uz";
import { AdminNav } from "../admin-nav";
import { BookReportRow, ContentReportCard } from "./report-cards";

export const metadata: Metadata = { title: uz.admin.reportsTitle, robots: { index: false } };

const t = uz.admin;

// Shikoyatlar navbati: taqriz/xabar/profil ustidan shikoyatlar va katalogdagi xato haqidagi xabarlar. Faqat admin.
async function Queue() {
  if (!(await getAdminUser())) notFound();
  const [groups, bookReports] = await Promise.all([getOpenContentReports(), getOpenBookReports()]);

  return (
    <>
      <section>
        <h2 className="mb-3 font-serif text-xl font-semibold">
          {t.contentReports} <span className="text-base font-normal text-muted">· {groups.length}</span>
        </h2>
        {groups.length ? (
          <ul className="space-y-4">
            {groups.map((g) => (
              <ContentReportCard key={g.reportId} group={g} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t.noReports}</p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 font-serif text-xl font-semibold">
          {t.bookReports} <span className="text-base font-normal text-muted">· {bookReports.length}</span>
        </h2>
        {bookReports.length ? (
          <ul className="space-y-3">
            {bookReports.map((r) => (
              <BookReportRow key={r.id} report={r} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t.noReports}</p>
        )}
      </section>
    </>
  );
}

export default function ReportsPage() {
  return (
    <Container className="py-8 sm:py-10">
      <h1 className="font-serif text-3xl font-semibold">{t.reportsTitle}</h1>
      <p className="mb-5 mt-1 max-w-3xl text-sm text-muted">{t.reportsIntro}</p>
      <AdminNav current="reports" />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
        <Queue />
      </Suspense>
    </Container>
  );
}
