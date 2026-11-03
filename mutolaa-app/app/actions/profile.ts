"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { uz } from "@/lib/i18n/uz";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";
import type { ActionResult } from "./shelf";

const profileSchema = z.object({
  display_name: z.string().trim().max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || /^[a-z0-9_]{3,30}$/.test(v), uz.settings.usernameHint),
  yearly_goal: z.string().trim().refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) > 0 && Number(v) <= 1000)),
  is_public: z.literal("on").optional(),
});

export async function updateProfile(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: uz.common.error };
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? uz.common.error };
  const isPublic = parsed.data.is_public === "on";
  // ochiq profil manzili /u/<username> — nomsiz ochib boʻlmaydi
  if (isPublic && !parsed.data.username) return { ok: false, error: uz.settings.publicNeedsUsername };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.display_name || null,
      username: parsed.data.username || null,
      yearly_goal: parsed.data.yearly_goal ? Number(parsed.data.yearly_goal) : null,
      is_public: isPublic,
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.code === "23505" ? uz.settings.usernameTaken : uz.common.error };
  refresh();
  return { ok: true, message: uz.settings.saved };
}
