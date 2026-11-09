import { NextResponse, type NextRequest } from "next/server";
import { handleUpdate, type TgUpdate } from "@/lib/bot/handlers";
import { safeEqual } from "@/lib/safe-equal";

// Ovozli xabar + Gemini tahlili oddiy 10 soniyadan uzoq choʻzilishi mumkin
export const maxDuration = 60;

// Telegram webhook. Faqat TELEGRAM_WEBHOOK_SECRET bilan kelgan (ya'ni Telegram'dan) soʻrovlar qabul qilinadi
// (scripts/telegram-webhook.ts webhook'ni shu secret bilan oʻrnatadi).
// Secret majburiy: usiz har kim soxta update yuborib (from.id = boshqa odam), /login havolasini oʻz chatiga olishi mumkin edi.
export async function POST(req: NextRequest) {
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    console.error("TELEGRAM_WEBHOOK_SECRET oʻrnatilmagan — bot soʻrovlari rad etiladi");
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (!safeEqual(req.headers.get("x-telegram-bot-api-secret-token") ?? "", secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Har doim 200 qaytaramiz — aks holda Telegram bir xil update'ni qayta-qayta yuboradi
  try {
    const step = await handleUpdate(update);
    return NextResponse.json({ ok: true, step });
  } catch (err) {
    console.error("Bot xatosi:", err);
    return NextResponse.json({ ok: true, step: "error" });
  }
}
