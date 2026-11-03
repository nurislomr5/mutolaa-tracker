"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

// Kuzatish: RLS faqat ochiq profilni va faqat oʻz nomingizdan kuzatishga ruxsat beradi
export async function setFollow(profileId: string, follow: boolean) {
  const parsed = z.object({ profileId: z.uuid(), follow: z.boolean() }).safeParse({ profileId, follow });
  const me = await getSessionUser();
  if (!parsed.success || !me || me.id === profileId) return { ok: false };
  const supabase = await createServerSupabase();
  const { error } = parsed.data.follow
    ? await supabase.from("follows").upsert({ follower_id: me.id, following_id: profileId })
    : await supabase.from("follows").delete().eq("follower_id", me.id).eq("following_id", profileId);
  refresh();
  return { ok: !error };
}
