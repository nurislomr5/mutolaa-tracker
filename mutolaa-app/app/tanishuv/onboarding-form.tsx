"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveOnboarding } from "@/app/actions/onboarding";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/i18n/uz";

type TopicOption = { id: number; name: string };

export function OnboardingForm({
  topics,
  selected,
  goal,
  isNew,
}: {
  topics: TopicOption[];
  selected: number[];
  goal: number | null;
  isNew: boolean;
}) {
  const t = uz.onboarding;
  const [state, action, pending] = useActionState(saveOnboarding, null);
  const chosen = new Set(selected);
  return (
    <form action={action} className="space-y-8">
      <fieldset>
        <legend className="font-serif text-xl font-semibold">{t.topicsTitle}</legend>
        <p className="mb-4 mt-1 text-sm text-muted">{t.topicsHint}</p>
        <div className="flex flex-wrap gap-2">
          {topics.map((tp) => (
            <label
              key={tp.id}
              className="cursor-pointer select-none rounded-full border border-border bg-surface px-3.5 py-2 text-sm text-muted transition-colors hover:text-text has-checked:border-accent has-checked:bg-accent has-checked:text-accent-fg has-focus-visible:ring-2 has-focus-visible:ring-accent"
            >
              <input type="checkbox" name="topic" value={tp.id} defaultChecked={chosen.has(tp.id)} className="sr-only" />
              {tp.name}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="font-serif text-xl font-semibold">{t.goalTitle}</span>
        <span className="mb-3 mt-1 block text-sm text-muted">{t.goalHint}</span>
        <Input
          name="yearly_goal"
          type="number"
          inputMode="numeric"
          min={1}
          max={1000}
          defaultValue={goal ?? ""}
          placeholder="12"
          className="max-w-32"
        />
      </label>

      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {isNew ? t.submit : t.save}
        </Button>
        {isNew ? (
          <Button type="submit" name="intent" value="skip" variant="secondary" size="lg" disabled={pending} formNoValidate>
            {t.skip}
          </Button>
        ) : (
          <Link href="/" className={buttonClasses({ variant: "secondary", size: "lg" })}>
            {uz.common.cancel}
          </Link>
        )}
      </div>
    </form>
  );
}
