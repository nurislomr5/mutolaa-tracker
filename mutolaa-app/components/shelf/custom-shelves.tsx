"use client";

import { useActionState, useOptimistic, useTransition } from "react";
import { createShelf, toggleShelfBook } from "@/app/actions/shelf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/i18n/uz";

export function CustomShelves({
  bookId,
  shelves,
  selected,
}: {
  bookId: number;
  shelves: { id: number; name: string }[];
  selected: number[];
}) {
  const [, start] = useTransition();
  const [checked, setChecked] = useOptimistic(selected);
  const [state, action, pending] = useActionState(createShelf, null);

  return (
    <div className="space-y-3">
      {shelves.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {shelves.map((s) => {
            const on = checked.includes(s.id);
            return (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      start(async () => {
                        setChecked(on ? checked.filter((x) => x !== s.id) : [...checked, s.id]);
                        await toggleShelfBook(s.id, bookId, !on);
                      })
                    }
                    className="accent-[var(--accent)]"
                  />
                  {s.name}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <form action={action} className="flex gap-2">
        <input type="hidden" name="bookId" value={bookId} />
        <Input name="name" required maxLength={60} placeholder={uz.shelf.newShelf} className="h-9" />
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {uz.shelf.create}
        </Button>
      </form>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
    </div>
  );
}
