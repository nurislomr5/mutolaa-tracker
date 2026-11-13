import { cacheLife } from "next/cache";

// Telegram Bot API bilan ishlash uchun kichik yordamchilar

const token = () => (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();

import { site } from "@/lib/site";

export { siteUrl as appUrl } from "@/lib/site";

export function esc(text: string | null | undefined) {
  return (text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type InlineButton =
  | { text: string; callback_data: string }
  | { text: string; url: string }
  | { text: string; web_app: { url: string } };

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: T; description?: string }> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!data.ok) console.error(`Telegram ${method} xatosi:`, data.description);
  return data;
}

export async function sendMessage(chatId: number, text: string, keyboard?: InlineButton[][]) {
  const result = await call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard?.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
  // web_app tugmasi guruh chatlarida ishlamaydi — tugmasiz qayta yuboramiz
  if (!result.ok && keyboard?.length) return call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
  return result;
}

export function answerCallback(callbackQueryId: string, text?: string) {
  return call("answerCallbackQuery", { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
}

export type InlineArticle = {
  id: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  message_text: string;
  url?: string;
  button_text?: string;
};

export function answerInlineQuery(inlineQueryId: string, articles: InlineArticle[]) {
  return call("answerInlineQuery", {
    inline_query_id: inlineQueryId,
    cache_time: 60,
    results: articles.map((a) => ({
      type: "article",
      id: a.id,
      title: a.title,
      ...(a.description ? { description: a.description } : {}),
      ...(a.thumbnail_url ? { thumbnail_url: a.thumbnail_url } : {}),
      input_message_content: {
        message_text: a.message_text,
        parse_mode: "HTML",
      },
      ...(a.url ? { reply_markup: { inline_keyboard: [[{ text: a.button_text ?? `${site.name}da ochish ↗`, url: a.url }]] } } : {}),
    })),
  });
}

export async function downloadFile(fileId: string): Promise<ArrayBuffer | null> {
  const file = await call<{ file_path: string }>("getFile", { file_id: fileId });
  if (!file.ok || !file.result) return null;
  const res = await fetch(`https://api.telegram.org/file/bot${token()}/${file.result.file_path}`);
  return res.ok ? res.arrayBuffer() : null;
}

// Bot @username — sozlamalardagi "bogʻlash" havolasi uchun (deyarli oʻzgarmaydi)
export async function getBotUsername(): Promise<string | null> {
  "use cache";
  cacheLife("days");
  if (!token()) return null;
  const me = await call<{ username: string }>("getMe", {});
  return me.result?.username ?? null;
}

// Progress-bar: █████░░░░░ 50%
export function drawBar(current: number, total: number | null) {
  if (!total || total <= 0) return `${"░".repeat(10)} —`;
  const pct = Math.min(100, Math.round((current / total) * 100));
  const filled = Math.round(pct / 10);
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)} ${pct}%`;
}
