"use client";

import { useOptimistic, useTransition } from "react";
import { setEntityFollow } from "@/app/actions/follow";
import { Button } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";

export function FollowEntityButton({ kind, id, following }: { kind: "author" | "publisher"; id: number; following: boolean }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(following);
  return (
    <Button
      variant={on ? "secondary" : "primary"}
      size="sm"
      disabled={pending}
      title={uz.reminders.followHint}
      onClick={() =>
        start(async () => {
          setOn(!on);
          await setEntityFollow(kind, id, !on);
        })
      }
    >
      {on ? uz.reminders.following : uz.reminders.follow}
    </Button>
  );
}
