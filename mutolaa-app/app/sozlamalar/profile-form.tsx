"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateProfile } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/i18n/uz";
import type { Profile } from "@/lib/shelf";

export function ProfileForm({ profile }: { profile: Profile }) {
  const t = uz.settings;
  const [state, action, pending] = useActionState(updateProfile, null);
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium">
        {t.displayName}
        <Input name="display_name" defaultValue={profile.display_name ?? ""} maxLength={80} className="mt-1" />
      </label>
      <label className="block text-sm font-medium">
        {t.username}
        <Input name="username" defaultValue={profile.username ?? ""} maxLength={30} pattern="[a-zA-Z0-9_]{3,30}" className="mt-1" />
        <span className="mt-1 block text-xs font-normal text-muted">{t.usernameHint}</span>
      </label>
      <label className="block text-sm font-medium">
        {t.yearlyGoal}
        <Input name="yearly_goal" type="number" min={1} max={1000} defaultValue={profile.yearly_goal ?? ""} className="mt-1 max-w-32" />
      </label>
      <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
        <input type="checkbox" name="is_public" defaultChecked={profile.is_public} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        <span>
          <span className="font-medium">{t.isPublic}</span>
          <span className="mt-0.5 block text-xs text-muted">{t.isPublicHint}</span>
          {profile.is_public && profile.username && (
            <Link href={`/u/${profile.username}`} className="mt-1 inline-block text-xs text-accent hover:underline">
              {t.viewProfile} →
            </Link>
          )}
        </span>
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t.save}
        </Button>
        {state && <span className={state.ok ? "text-sm text-accent" : "text-sm text-danger"}>{state.ok ? state.message : state.error}</span>}
      </div>
    </form>
  );
}
