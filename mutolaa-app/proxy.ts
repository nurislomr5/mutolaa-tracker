import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canonicalRedirect } from "@/lib/site";

// Faqat kirgan foydalanuvchilar uchun sahifalar
const PROTECTED = ["/klublar/yangi", "/javonim", "/kitob-qoshish", "/skaner", "/lenta", "/qaydlar", "/statistika", "/sarhisob", "/sozlamalar", "/tanishuv"];

// Har bir soʻrovda Supabase sessiyasini yangilaydi va himoyalangan sahifalarga mehmonni /kirish ga yuboradi.
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

export const config = {
  // statik fayllar, rasmlar, PWA fayllari va Telegram webhook'dan tashqari hamma sahifalar
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|api/bot|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
