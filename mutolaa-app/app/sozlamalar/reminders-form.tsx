"use client";

import { useActionState } from "react";
import { updateReminders } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";
import type { Profile } from "@/lib/shelf";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function RemindersForm({ profile, telegramLinked }: { profile: Profile; telegramLinked: boolean }) {
  const t = uz.reminders;
  const [state, action, pending] = useActionState(updateReminders, null);

  return (
    <form action={action} className="space-y-4">
      {!telegramLinked && <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">{t.needTelegram}</p>}
      <fieldset disabled={!telegramLinked} className="space-y-4 disabled:opacity-50">
        <label className="block text-sm font-medium">
          {t.hour}
          <select
            name="reminder_hour"
            defaultValue={profile.reminder_hour ?? ""}
            className="mt-1 block h-10 w-40 rounded-lg border border-border bg-surface px-3 text-sm"
          >
            <option value="">{t.off}</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="streak_alerts" defaultChecked={profile.streak_alerts} className="h-4 w-4 accent-[var(--accent)]" />
          {t.streakAlerts}
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="weekly_digest" defaultChecked={profile.weekly_digest} className="h-4 w-4 accent-[var(--accent)]" />
          {t.weeklyDigest}
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={pending}>
            {uz.settings.save}
          </Button>
          {state && <span className={state.ok ? "text-sm text-accent" : "text-sm text-danger"}>{state.ok ? state.message : state.error}</span>}
        </div>
      </fieldset>
    </form>
  );
}
