// Sayt egasiga Telegram orqali xato haqida xabar. Chat ID: ALERT_TELEGRAM_CHAT_ID yoki (Vercel'da avvaldan bor) MY_TELEGRAM_ID;
// oʻz ID'ingizni botga /id yuborib bilib olasiz.
// Sozlanmagan boʻlsa — faqat konsol (Vercel loglari). Bir xil xato 10 daqiqada bir martadan koʻp yuborilmaydi.

const THROTTLE_MS = 10 * 60_000;
const recent = new Map<string, number>(); // har bir server instansi uchun alohida — taxminiy cheklov yetarli

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendAlert(key: string, title: string, lines: string[]) {
  console.error(`[alert] ${title}`, lines.join(" | "));
  const chatId = (process.env.ALERT_TELEGRAM_CHAT_ID || process.env.MY_TELEGRAM_ID || "").trim();
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!chatId || !token) return;

  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - THROTTLE_MS) return;
  recent.set(key, now);
  if (recent.size > 500) recent.delete(recent.keys().next().value!);

  const text = [`⚠️ <b>${esc(title)}</b>`, ...lines.map((l) => esc(l).slice(0, 700))].join("\n").slice(0, 4000);
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // ogohlantirish yuborilmasa ham asosiy soʻrovga xalaqit bermaymiz
  }
}
