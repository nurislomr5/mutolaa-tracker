import { NextResponse, type NextRequest } from "next/server";
import { getNotificationsBadge, markNotificationsRead } from "@/lib/notifications";

// Sarlavhadagi qoʻngʻiroqcha uchun: GET — oʻqilmagan bildirishnomalar soni, POST — hammasini oʻqilgan deb belgilash.
// Server Action emas, oddiy fetch: sarlavha sahifalar almashganda qayta chizilmaydi, sonni brauzer oʻzi soʻrab turadi;
// belgilash esa ochiq turgan roʻyxatni qayta yuklamasligi kerak (yangi kelganlari ajralib koʻrinib tursin).

const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  return NextResponse.json({ count: await getNotificationsBadge() }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  // Boshqa saytdan yuborilgan soʻrov (CSRF) — cookie Lax boʻlsa ham qoʻshimcha tekshiruv
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.nextUrl.host) return NextResponse.json({ ok: false }, { status: 403, headers: noStore });
  return NextResponse.json({ ok: await markNotificationsRead() }, { headers: noStore });
}
