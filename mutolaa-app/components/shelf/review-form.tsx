"use client";

import { useActionState, useState } from "react";
import { saveReview } from "@/app/actions/shelf";
import { Button } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";
import { parseReviewSpoiler } from "@/lib/shelf-types";

export function ReviewForm({ userBookId, review }: { userBookId: number; review: string | null }) {
  const [state, action, pending] = useActionState(saveReview, null);
  const parsed = parseReviewSpoiler(review);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userBookId" value={userBookId} />
      <textarea
        name="review"
        defaultValue={parsed.text}
        rows={4}
        maxLength={10_000}
        placeholder={uz.shelf.reviewPlaceholder}
        className="w-full rounded-lg border border-border bg-surface p-3 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
      />
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="is_spoiler" defaultChecked={parsed.isSpoiler} className="h-4 w-4 accent-accent" />
        <span>{uz.shelf.spoilerLabel}</span>
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {uz.shelf.save}
        </Button>
        {state && <span className={state.ok ? "text-sm text-accent" : "text-sm text-danger"}>{state.ok ? state.message : state.error}</span>}
      </div>
    </form>
  );
}

export function ReviewText({ review, className = "mt-2 line-clamp-6 whitespace-pre-line text-sm" }: { review: string | null; className?: string }) {
  const { isSpoiler, text } = parseReviewSpoiler(review);
  const [revealed, setRevealed] = useState(!isSpoiler);
  if (!text) return null;

  if (!revealed) {
    return (
      <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs">
        <span className="text-muted">⚠ {uz.shelf.spoilerHidden}</span>
        <button type="button" onClick={() => setRevealed(true)} className="font-semibold text-accent hover:underline">
          {uz.shelf.spoilerShow}
        </button>
      </div>
    );
  }

  return <p className={className}>{text}</p>;
}
