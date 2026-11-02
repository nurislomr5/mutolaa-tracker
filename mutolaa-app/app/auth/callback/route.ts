import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createServerSupabase } from "@/lib/supabase/server";

// Email havolasi (PKCE) va Google OAuth shu yerga qaytadi: ?code=… -> sessiya cookie'si
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/kirish?xato=havola&next=${encodeURIComponent(next)}`);
}
