import { NextResponse, type NextRequest } from "next/server";
import { applyOfflineOps, buildSnapshot, offlineOpsSchema } from "@/lib/offline";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

// Oflayn javon: GET — telefonga saqlanadigan javon nusxasi, POST — internet qaytganda yuborilgan amallar navbati.
// Server Action emas, oddiy fetch: experimental.useOffline server action'larni internet qaytguncha "kutib turadi",
// bu yerda esa xato darhol qaytishi kerak (navbat telefonda qoladi).

const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401, headers: noStore });
  const snapshot = await buildSnapshot(await createServerSupabase(), user.id);
  return NextResponse.json(snapshot, { headers: noStore });
}

export async function POST(request: NextRequest) {
  // Boshqa saytdan yuborilgan soʻrov (CSRF) — cookie Lax boʻlsa ham qoʻshimcha tekshiruv
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.nextUrl.host) return NextResponse.json({ error: "origin" }, { status: 403, headers: noStore });

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401, headers: noStore });

  const parsed = offlineOpsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });

  const db = await createServerSupabase();
  const results = await applyOfflineOps(db, user.id, parsed.data.ops);
  return NextResponse.json({ results, snapshot: await buildSnapshot(db, user.id) }, { headers: noStore });
}
