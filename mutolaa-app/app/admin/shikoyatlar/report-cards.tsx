"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { resolveBookReport, resolveContentReport, type AdminResult } from "@/app/actions/admin-reports";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminPerson, OpenBookReport, ReportGroup } from "@/lib/admin-panel";
import { formatDate } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const t = uz.admin;
const reasons: Record<string, string> = uz.report.reasons;

function Person({ person }: { person: AdminPerson | null }) {
  if (!person) return <span className="text-muted">{t.deletedUser}</span>;
  const name = person.display_name || (person.username ? `@${person.username}` : t.noName);
  return person.is_public && person.username ? (
    <Link href={`/u/${person.username}`} target="_blank" className="font-medium hover:text-accent">
      {name}
    </Link>
  ) : (
    <span className="font-medium">{name}</span>
  );
}

// Bitta nishon (taqriz, klub xabari yoki profil) ustidan tushgan hamma ochiq shikoyatlar — bitta karta
export function ContentReportCard({ group }: { group: ReportGroup }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const run = (decision: "remove" | "dismiss") => start(async () => setResult(await resolveContentReport(group.reportId, decision)));

  if (result?.ok) return <li className="rounded-xl border border-border bg-surface p-4 text-sm text-accent">{result.message}</li>;

  const isText = group.type !== "profile";
  const changed = isText && !group.gone && group.snapshot != null && group.snapshot !== group.current;
  return (
    <li className={cn("rounded-2xl border border-border bg-surface p-4", pending && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="warning">{t.targetType[group.type]}</Badge>
        {group.reports.length > 1 && <Badge tone="danger">{t.reportCount(group.reports.length)}</Badge>}
        {group.where && (
          <span className="text-muted">
            {t.where[group.type]}: <span className="text-text">{group.where}</span>
          </span>
        )}
        {group.href && (
          <Link href={group.href} target="_blank" className="ml-auto text-accent hover:underline">
            {t.open}
          </Link>
        )}
      </div>

      <p className="mt-3 text-sm">
        <span className="text-muted">{t.author}:</span> <Person person={group.author} />
      </p>

      {group.gone ? (
        <p className="mt-2 text-sm text-muted">{isText ? t.gone : t.goneProfile}</p>
      ) : (
        isText && <blockquote className="mt-2 whitespace-pre-line break-words rounded-lg bg-surface-2 p-3 text-sm">{group.current}</blockquote>
      )}
      {isText && (group.gone || changed) && group.snapshot && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-xs text-muted">{changed ? `${t.changed} ${t.snapshot}` : t.snapshot}</summary>
          <blockquote className="mt-2 whitespace-pre-line break-words rounded-lg bg-surface-2 p-3">{group.snapshot}</blockquote>
        </details>
      )}

      <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
        {group.reports.map((r) => (
          <li key={r.id}>
            <span className="font-medium text-danger">{reasons[r.reason] ?? r.reason}</span>
            {r.message && <span> — {r.message}</span>}
            <span className="block text-xs text-muted">
              {t.reporter}: <Person person={r.reporter} /> · {formatDate(r.created_at)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {group.gone ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("dismiss")}>
            {t.close}
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                if (window.confirm(t.removeConfirm[group.type])) run("remove");
              }}
            >
              {t.remove[group.type]}
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("dismiss")}>
              {t.dismiss}
            </Button>
          </>
        )}
        {result && !result.ok && <span className="text-sm text-danger">{result.error}</span>}
      </div>
      {!isText && !group.gone && <p className="mt-2 text-xs text-muted">{t.profileNote}</p>}
    </li>
  );
}

// Katalogdagi xato haqidagi xabar ("Xatoni bildirish")
export function BookReportRow({ report }: { report: OpenBookReport }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);

  if (result?.ok) return <li className="rounded-xl border border-border bg-surface p-4 text-sm text-accent">{result.message}</li>;

  return (
    <li className={cn("rounded-2xl border border-border bg-surface p-4", pending && "opacity-60")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {report.book ? (
          <Link href={`/kitob/${report.book.slug}`} target="_blank" className="font-semibold hover:text-accent">
            {report.book.title}
          </Link>
        ) : (
          <span className="text-muted">{t.gone}</span>
        )}
        <span className="text-xs text-muted">
          <Person person={report.reporter} /> · {formatDate(report.created_at)}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-line break-words text-sm">{report.message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {report.book && (
          <Link href={`/kitob/${report.book.slug}/tahrirlash`} target="_blank" className="text-sm text-accent hover:underline">
            {t.editBook} ↗
          </Link>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          className="ml-auto"
          onClick={() => start(async () => setResult(await resolveBookReport(report.id)))}
        >
          {t.resolve}
        </Button>
        {result && !result.ok && <span className="w-full text-sm text-danger">{result.error}</span>}
      </div>
    </li>
  );
}
