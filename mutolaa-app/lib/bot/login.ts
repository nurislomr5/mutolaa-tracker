import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/bot/telegram";

// Telegram orqali saytga kirish: bot foydalanuvchini Telegram ID boʻyicha taniydi (yoki yangi hisob ochadi)
// va bir martalik kirish havolasini (magic link token) faqat shu shaxsiy chatga yuboradi. Email yuborilmaydi.

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };

// Telegram orqali ochilgan hisoblar uchun yetkazib boʻlmaydigan (RFC 2606) manzil — xat hech qachon ketmaydi
export const telegramEmail = (telegramId: number) => `tg${telegramId}@telegram.invalid`;
export const isTelegramEmail = (email: string | null | undefined) => Boolean(email?.endsWith("@telegram.invalid"));

export async function createLoginLink(db: SupabaseClient, from: TgUser): Promise<string | null> {
  let email: string | null = null;

  const { data: linked } = await db.from("telegram_accounts").select("user_id").eq("telegram_id", from.id).maybeSingle();
  if (linked) {
    const { data } = await db.auth.admin.getUserById(linked.user_id);
    email = data.user?.email ?? null;
  } else {
    const name = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || null;
    const { data, error } = await db.auth.admin.createUser({
      email: telegramEmail(from.id),
      email_confirm: true,
      user_metadata: { full_name: name, telegram_username: from.username ?? null },
    });
    if (error || !data.user) return null;
    await db.from("telegram_accounts").insert({ user_id: data.user.id, telegram_id: from.id });
    email = data.user.email ?? null;
  }
  if (!email) return null;

  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) return null;
  return `${appUrl()}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=%2Fjavonim`;
}
