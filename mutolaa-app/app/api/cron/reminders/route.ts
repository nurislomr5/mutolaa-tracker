import { NextResponse, type NextRequest } from "next/server";
import { runReminders, runSiteNotifications } from "@/lib/bot/reminders";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeEqual } from "@/lib/safe-equal";

export const maxDuration = 60;

// Har soatda GitHub Actions chaqiradi (.github/workflows/reminders.yml). Faqat CRON_SECRET bilan.
// Sinov: ?dry=1 (xabar yubormaydi, kimga nima ketishini qaytaradi), ?soat=21 (Toshkent soatini almashtirish)
export async function POST(req: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const params = req.nextUrl.searchParams;
  const hour = params.has("soat") ? Number(params.get("soat")) : undefined;
  const opts = {
    dryRun: params.get("dry") === "1",
    hour: hour !== undefined && Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : undefined,
  };
  const db = createAdminClient();
  // saytdagi bildirishnomalar Telegram eslatmalariga bogʻliq emas — biri yiqilsa ikkinchisi ishlayversin
  const site = await runSiteNotifications(db, opts).catch((e) => {
    console.error("[bildirishnomalar]", e);
    return { newBooks: null, weekly: null };
  });
  const report = await runReminders(db, opts);
  return NextResponse.json({ ok: true, count: report.length, site, report });
}
