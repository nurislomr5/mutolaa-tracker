"use server";

import { z } from "zod";
import { appUrl, esc, sendMessage } from "@/lib/bot/telegram";
import { uz } from "@/lib/i18n/uz";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/supabase/server";

// Kitob boʻyicha xato haqida xabar → admin Telegram chati. Faqat tizimga kirgan foydalanuvchi,
// soatiga REPORTS_PER_HOUR tadan koʻp emas (book_reports jadvali boʻyicha sanaladi — service role).

export type ReportResult = { ok: true; message: string } | { ok: false; error: string };

const REPORTS_PER_HOUR = 5;

const schema = z.object({
  slug: z.string().trim().min(1).max(200),
  message: z.string().trim().min(3).max(1000),
});

export async function reportBookIssue(_prev: ReportResult | null, formData: FormData): Promise<ReportResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: uz.book.reportLogin };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: uz.common.error };
  const { slug, message } = parsed.data;

  const admin = createAdminClient();

  // Nom formadan emas, bazadan olinadi — slug haqiqiy kitobga tegishli boʻlishi shart
  const { data: book } = await admin.from("books").select("id, slug, title").eq("slug", slug).maybeSingle();
  if (!book) return { ok: false, error: uz.common.error };

  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error: countError } = await admin
    .from("book_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if (countError) return { ok: false, error: uz.common.error };
  if ((count ?? 0) >= REPORTS_PER_HOUR) return { ok: false, error: uz.book.reportLimit };

  // Avval jurnalga yoziladi: yozib boʻlmasa, xabar ham yuborilmaydi (cheklovni chetlab oʻtib boʻlmasin)
  const { error: insertError } = await admin.from("book_reports").insert({ user_id: user.id, book_id: book.id, message });
  if (insertError) return { ok: false, error: uz.common.error };

  const chatId = Number((process.env.ALERT_TELEGRAM_CHAT_ID ?? process.env.MY_TELEGRAM_ID ?? "").trim());
  if (chatId && !Number.isNaN(chatId)) {
    const text =
      `🚩 <b>Kitob boʻyicha xabar</b>\n` +
      `📖 <b>${esc(book.title)}</b>\n` +
      `🔗 ${appUrl()}/kitob/${encodeURIComponent(book.slug)}\n` +
      `👤 <code>${esc(user.id)}</code>\n` +
      `\n💬 ${esc(message)}`;
    await sendMessage(chatId, text).catch(() => null);
  } else {
    console.info("[BookIssue]", { slug: book.slug, userId: user.id, message });
  }

  return { ok: true, message: uz.book.reportSent };
}
