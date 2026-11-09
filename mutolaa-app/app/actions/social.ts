"use server";

import { refresh, updateTag } from "next/cache";
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

// "Foydali" ovozi: RLS faqat ochiq profildagi boshqa odamning taqriziga va faqat oʻz nomingizdan ruxsat beradi
export async function setHelpful(reviewId: number, helpful: boolean) {
  const parsed = z.object({ reviewId: z.number().int().positive(), helpful: z.boolean() }).safeParse({ reviewId, helpful });
  const me = await getSessionUser();
  if (!parsed.success || !me) return { ok: false };
  const supabase = await createServerSupabase();
  const { error } = parsed.data.helpful
    ? await supabase.from("review_votes").upsert({ user_book_id: parsed.data.reviewId }, { onConflict: "user_id,user_book_id", ignoreDuplicates: true })
    : await supabase.from("review_votes").delete().eq("user_id", me.id).eq("user_book_id", parsed.data.reviewId);
  if (error) return { ok: false };
  // Kitob sahifasidagi sharhlar tartibi va soni (keshlangan) yangilansin
  const { data } = await supabase.from("user_books").select("book_id").eq("id", parsed.data.reviewId).maybeSingle();
  if (data?.book_id) updateTag(`reviews:${data.book_id}`);
  refresh();
  return { ok: true };
}
