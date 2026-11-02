"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteShelf } from "@/app/actions/shelf";
import { uz } from "@/lib/i18n/uz";

export function DeleteShelfButton({ shelfId }: { shelfId: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(uz.shelf.deleteShelfConfirm)) return;
        start(async () => {
          const res = await deleteShelf(shelfId);
          if (res.ok) router.push("/javonim");
        });
      }}
      className="text-sm text-muted hover:text-danger"
    >
      {uz.shelf.deleteShelf}
    </button>
  );
}
