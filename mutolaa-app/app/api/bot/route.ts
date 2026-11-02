import { NextResponse, type NextRequest } from "next/server";
import { handleUpdate, type TgUpdate } from "@/lib/bot/handlers";

// Ovozli xabar + Gemini tahlili oddiy 10 soniyadan uzoq choʻzilishi mumkin
export const maxDuration = 60;

// Telegram webhook. TELEGRAM_WEBHOOK_SECRET berilgan boʻlsa, faqat Telegram'dan kelgan soʻrovlar qabul qilinadi
// (scripts/telegram-webhook.ts webhook'ni shu secret bilan oʻrnatadi).
export async function POST(req: NextRequest) {
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
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
