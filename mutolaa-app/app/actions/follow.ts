"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

// Muallif yoki nashriyotni kuzatish — yangi kitoblari chiqqanda Telegram'ga xabar (lib/bot/reminders.ts)
export async function setEntityFollow(kind: "author" | "publisher", id: number, follow: boolean) {
  const parsed = z.object({ kind: z.enum(["author", "publisher"]), id: z.number().int().positive(), follow: z.boolean() }).safeParse({ kind, id, follow });
  const user = await getSessionUser();
  if (!parsed.success || !user) return { ok: false };
  const supabase = await createServerSupabase();
  const table = kind === "author" ? "author_follows" : "publisher_follows";
  const column = kind === "author" ? "author_id" : "publisher_id";
  const { error } = follow
    ? await supabase.from(table).upsert({ user_id: user.id, [column]: id }, { onConflict: `user_id,${column}`, ignoreDuplicates: true })
    : await supabase.from(table).delete().eq("user_id", user.id).eq(column, id);
  refresh();
  return { ok: !error };
}
