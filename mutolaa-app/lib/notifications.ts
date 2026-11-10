import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

// Saytdagi bildirishnomalar — 20261115000017 migratsiyasi. Jadval yopiq: faqat my_notifications(),
// unread_notifications_count() va mark_notifications_read() funksiyalari orqali ishlaydi.

export type NotificationKind = "follow" | "helpful" | "club_post" | "club_reply" | "new_book" | "weekly";

export type Notification = {
  id: number;
  kind: NotificationKind;
  created_at: string;
  unread: boolean;
  n: number; // bir kunda yigʻilgan voqealar soni ("Foydali" ovozlari, klubdagi yangi mavzular)
  actor_name: string | null; // yopiq profilli kuzatuvchi va ovoz beruvchilar uchun boʻsh
  actor_username: string | null;
  actor_avatar: string | null;
  book_slug: string | null;
  book_title: string | null;
  book_cover: string | null;
  club_slug: string | null;
  club_name: string | null;
  post_id: number | null;
  ref_date: string | null; // haftalik xulosa: hafta boshlangan dushanba
};

// Xato boʻlsa null: bildirishnomalar ishlamasa ham saytning qolgan qismi ishlashi kerak
export async function getNotifications(limit = 50): Promise<{ items: Notification[]; now: number } | null> {
  if (!(await getSessionUser())) return null;
  const supabase = await createServerSupabase();
  // soʻrov vaqti sessiya oʻqilgandan keyin olinadi — prerender paytida Date.now() chaqirilmasin
  const now = Date.now();
  const { data, error } = await supabase.rpc("my_notifications", { p_limit: limit });
  if (error) {
    console.error("[bildirishnomalar]", error.message);
    return null;
  }
  return { items: (data ?? []) as Notification[], now };
}

// Sarlavhadagi nishon uchun; xato boʻlsa 0
export async function getNotificationsBadge(): Promise<number> {
  if (!(await getSessionUser())) return 0;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("unread_notifications_count");
  if (error) {
    console.error("[bildirishnomalar]", error.message);
    return 0;
  }
  return Number(data ?? 0);
}

export async function markNotificationsRead(): Promise<boolean> {
  if (!(await getSessionUser())) return false;
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("mark_notifications_read");
  if (error) console.error("[bildirishnomalar]", error.message);
  return !error;
}
