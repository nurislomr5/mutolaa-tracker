import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PROTECTED } from "@/lib/protected-paths";
import { canonicalRedirect } from "@/lib/site";

// Supabase sessiyasini yangilaydi va himoyalangan sahifalarga mehmonni /kirish ga yuboradi.
// Bu faqat optimistik tekshiruv — haqiqiy ruxsat RLS va server action'lardagi getSessionUser() da.
export async function proxy(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const moved = canonicalRedirect(request.method, host, request.nextUrl.pathname, request.nextUrl.search);
  // eski domendan koʻchirish doimiy (308), kirish kodini uzatish esa bir martalik
  if (moved) return NextResponse.redirect(new URL(moved, request.url), moved.startsWith("https://") ? 308 : 307);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;

  if (!data?.claims && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/kirish";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

// Proxy faqat kerak boʻlgan soʻrovda ishga tushadi. Mehmon (va qidiruv roboti) ochiq sahifani ochganda u chaqirilmaydi:
// har bir chaqiruv server vaqti va trafik sarflaydi, 2026-yil noyabrda bitta kunlik robot oqimi bepul limitni tugatgan.
//   1) himoyalangan sahifalar — lib/protected-paths.ts dagi roʻyxat bilan bir xil (tests/proxy.test.ts tekshiradi);
//   2) Supabase sessiya cookie'si bor soʻrovlar — sessiyani yangilash uchun (statik fayllar va bot/cron API'dan tashqari);
//   3) eski domen — asosiy domenga koʻchirish (lib/site.ts dagi LEGACY_HOSTS bilan bir xil);
//   4) /?code=… — kirish kodini /auth/callback ga uzatish.
// Qiymatlar build paytida oʻqiladi, shuning uchun oʻzgaruvchi emas, toʻgʻridan-toʻgʻri yozilgan.
export const config = {
  matcher: [
    "/(klublar/yangi|javonim|kitob-qoshish|skaner|lenta|qaydlar|statistika|sarhisob|sozlamalar|tanishuv|bildirishnomalar|hafta)(.*)",
    {
      source: "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|api/bot|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      has: [{ type: "header", key: "cookie", value: ".*sb-[A-Za-z0-9]+-auth-token.*" }],
    },
    {
      source: "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      has: [{ type: "host", value: "mutolaa-tracker.vercel.app" }],
    },
    { source: "/", has: [{ type: "query", key: "code" }] },
  ],
};
