import { NextResponse, type NextRequest } from "next/server";
import { telegramLoginToken } from "@/lib/bot/login";
import { verifyInitData } from "@/lib/bot/webapp-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

// Telegram Mini App ichida avtomatik kirish: sahifa Telegram imzolagan initData'ni yuboradi,
// imzo bot tokeni bilan tekshiriladi va shu Telegram hisobiga bogʻlangan foydalanuvchi sessiyasi cookie'ga yoziladi
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { initData?: unknown } | null;
  const from = typeof body?.initData === "string" ? verifyInitData(body.initData, (process.env.TELEGRAM_BOT_TOKEN ?? "").trim()) : null;
  if (!from) return NextResponse.json({ ok: false }, { status: 401 });

  // allaqachon kirgan boʻlsa sessiyaga tegmaymiz
  if (await getSessionUser()) return NextResponse.json({ ok: true, signedIn: false });

  const token = await telegramLoginToken(createAdminClient(), from);
  if (!token) return NextResponse.json({ ok: false }, { status: 500 });
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: token });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, signedIn: true });
}
