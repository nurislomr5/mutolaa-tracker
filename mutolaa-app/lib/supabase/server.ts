import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

// Har bir soʻrov uchun yangi klient (foydalanuvchi sessiyasi cookie'da). Faqat server komponent / action / route'da.
export async function createServerSupabase() {
  // Sessiya kodi (token muddati uchun Date.now()) faqat soʻrov vaqtida ishlashi kerak, prerender paytida emas
  await connection();
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server komponentda cookie yozib boʻlmaydi — sessiyani proxy.ts yangilaydi
        }
      },
    },
  });
}

export type SessionUser = { id: string; email: string | null };

// JWT imzosini tekshiradi (getSession'dan farqli oʻlaroq ishonchli)
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: (claims.email as string | undefined) ?? null };
}
