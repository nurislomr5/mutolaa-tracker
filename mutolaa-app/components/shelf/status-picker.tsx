"use client";

import { useTransition } from "react";
import { removeFromShelf, setShelfStatus } from "@/app/actions/shelf";
import { uz } from "@/lib/i18n/uz";
import { STATUSES, type ShelfStatus } from "@/lib/shelf-types";
import { cn } from "@/lib/utils";

export function StatusPicker({ bookId, userBookId, status }: { bookId: number; userBookId?: number; status?: ShelfStatus }) {
  const [pending, start] = useTransition();

  return (
    <div className={cn("space-y-2", pending && "opacity-60")}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            disabled={pending}
            aria-pressed={status === s}
            onClick={() => start(async () => void (await setShelfStatus(bookId, s)))}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              status === s ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface hover:bg-surface-2",
            )}
          >
            {uz.status[s]}
          </button>
        ))}
      </div>
      {userBookId && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm(uz.shelf.removeConfirm)) start(async () => void (await removeFromShelf(userBookId)));
          }}
          className="text-xs text-muted hover:text-danger"
        >
          {uz.shelf.remove}
        </button>
      )}
    </div>
  );
}
