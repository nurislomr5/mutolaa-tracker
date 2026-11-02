"use client";

import { useActionState } from "react";
import { saveReview } from "@/app/actions/shelf";
import { Button } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";

export function ReviewForm({ userBookId, review }: { userBookId: number; review: string | null }) {
  const [state, action, pending] = useActionState(saveReview, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userBookId" value={userBookId} />
      <textarea
        name="review"
        defaultValue={review ?? ""}
        rows={4}
        maxLength={10_000}
        placeholder={uz.shelf.reviewPlaceholder}
        className="w-full rounded-lg border border-border bg-surface p-3 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {uz.shelf.save}
        </Button>
        {state && <span className={state.ok ? "text-sm text-accent" : "text-sm text-danger"}>{state.ok ? state.message : state.error}</span>}
      </div>
    </form>
  );
}
