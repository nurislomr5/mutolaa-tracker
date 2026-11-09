"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { setHelpful } from "@/app/actions/social";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

// Taqriz ostidagi "👍 Foydali · N". Mehmon — kirish sahifasiga; oʻz taqrizi — faqat son.
export function HelpfulButton({
  reviewId,
  count,
  voted,
  mode,
  loginHref,
}: {
  reviewId: number;
  count: number;
  voted: boolean;
  mode: "vote" | "own" | "guest";
  loginHref: string;
}) {
  const [pending, start] = useTransition();
  const [state, setOptimistic] = useOptimistic({ count, voted });
  const t = uz.social;
  const className = cn(
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
    state.voted ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-text",
  );
  const label = (
    <>
      <span aria-hidden>👍</span>
      {t.helpful}
      {state.count > 0 && <span className="font-semibold">{state.count}</span>}
    </>
  );

  if (mode === "guest") {
    return (
      <Link href={loginHref} className={className}>
        {label}
      </Link>
    );
  }
  if (mode === "own") {
    return (
      <span className={cn(className, "hover:text-muted")} title={t.helpfulOwn}>
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={state.voted}
      title={state.voted ? t.helpfulVoted : t.helpful}
      disabled={pending}
      className={className}
      onClick={() =>
        start(async () => {
          const next = !state.voted;
          setOptimistic({ voted: next, count: state.count + (next ? 1 : -1) });
          await setHelpful(reviewId, next);
        })
      }
    >
      {label}
    </button>
  );
}
