"use server";

import { refresh } from "next/cache";
import { getBotUsername } from "@/lib/bot/telegram";
import { uz } from "@/lib/i18n/uz";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

export type LinkResult = { ok: true; url: string } | { ok: false; error: string };

// Bir martalik token yaratib, t.me/<bot>?start=<token> havolasini qaytaradi (bot uni /start da qabul qiladi)
export async function createTelegramLink(): Promise<LinkResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: uz.common.error };
  const username = await getBotUsername();
  if (!username) return { ok: false, error: uz.settings.telegramNotConfigured };

  const supabase = await createServerSupabase();
  // eski tokenlarni tozalaymiz — faqat oxirgisi amal qilsin
  await supabase.from("telegram_link_tokens").delete().eq("user_id", user.id);
  const { data, error } = await supabase.from("telegram_link_tokens").insert({ user_id: user.id }).select("token").single();
  if (error || !data) return { ok: false, error: uz.common.error };
  return { ok: true, url: `https://t.me/${username}?start=${data.token}` };
}

export async function unlinkTelegram() {
  const user = await getSessionUser();
  if (!user) return;
  const supabase = await createServerSupabase();
  await supabase.from("profiles").update({ telegram_id: null }).eq("id", user.id);
  refresh();
}
