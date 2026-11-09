"use server";

import { z } from "zod";
import { appUrl, esc, sendMessage } from "@/lib/bot/telegram";
import { uz } from "@/lib/i18n/uz";
import { getSessionUser } from "@/lib/supabase/server";

export type ReportResult = { ok: true; message: string } | { ok: false; error: string };

const schema = z.object({
  slug: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  message: z.string().trim().min(3).max(1000),
});

export async function reportBookIssue(_prev: ReportResult | null, formData: FormData): Promise<ReportResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: uz.common.error };

  const user = await getSessionUser();
  const chatId = Number((process.env.ALERT_TELEGRAM_CHAT_ID ?? process.env.MY_TELEGRAM_ID ?? "").trim());
  const { slug, title, message } = parsed.data;

  if (chatId && !Number.isNaN(chatId)) {
    const text =
      `🚩 <b>Kitob boʻyicha xabar</b>\n` +
      `📖 <b>${esc(title)}</b>\n` +
      `🔗 ${appUrl()}/kitob/${encodeURIComponent(slug)}\n` +
      (user ? `👤 <code>${esc(user.id)}</code>\n` : "") +
      `\n💬 ${esc(message)}`;
    await sendMessage(chatId, text).catch(() => null);
  } else {
    console.info("[BookIssue]", { slug, title, userId: user?.id ?? null, message });
  }

  return { ok: true, message: uz.book.reportSent };
}
