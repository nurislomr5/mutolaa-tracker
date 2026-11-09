"use client";

import { useState, useTransition } from "react";
import { joinClubByCode, type ClubResult } from "@/app/actions/clubs";
import { Button } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";

export function JoinByCodeButton({ code }: { code: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ClubResult | null>(null);
  return (
    <div>
      <Button type="button" disabled={pending} onClick={() => start(async () => setResult(await joinClubByCode(code)))}>
        {uz.clubs.join}
      </Button>
      <p className="mx-auto mt-2 max-w-sm text-xs text-muted">{uz.clubs.joinNote}</p>
      {result && !result.ok && <p className="mt-2 text-sm text-danger">{result.error}</p>}
    </div>
  );
}
