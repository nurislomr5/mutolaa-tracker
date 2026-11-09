"use client";

import { useActionState } from "react";
import { createClub, updateClub } from "@/app/actions/clubs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/i18n/uz";

// Klub ochish va (egasi uchun) tahrirlash formasi
export function ClubForm({ club }: { club?: { id: number; name: string; description: string | null; is_public: boolean } }) {
  const [state, action, pending] = useActionState(club ? updateClub : createClub, null);
  const t = uz.clubs;
  return (
    <form action={action} className="space-y-4">
      {club && <input type="hidden" name="clubId" value={club.id} />}
      <label className="block text-sm font-medium">
        {t.name}
        <Input name="name" required minLength={3} maxLength={80} defaultValue={club?.name} placeholder={t.namePlaceholder} className="mt-1" />
      </label>
      <label className="block text-sm font-medium">
        {t.description}
        <textarea
          name="description"
          maxLength={1000}
          rows={3}
          defaultValue={club?.description ?? ""}
          placeholder={t.descriptionPlaceholder}
          className="mt-1 w-full rounded-lg border border-border bg-surface p-3 text-sm placeholder:text-muted"
        />
      </label>
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1 font-medium">{t.visibility}</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="is_public" value="1" defaultChecked={club ? club.is_public : true} className="mt-1 accent-accent" />
          <span>{t.publicOption}</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="is_public" value="0" defaultChecked={club ? !club.is_public : false} className="mt-1 accent-accent" />
          <span>{t.privateOption}</span>
        </label>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {club ? t.save : t.submit}
        </Button>
        {state && <span className={state.ok ? "text-sm text-accent" : "text-sm text-danger"}>{state.ok ? state.message : state.error}</span>}
      </div>
    </form>
  );
}
