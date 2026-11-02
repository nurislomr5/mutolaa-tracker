import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createServerSupabase } from "@/lib/supabase/server";

// Email shablonida {{ .TokenHash }} ishlatilsa: ?token_hash=…&type=email.
// PKCE'dan farqli oʻlaroq havola boshqa brauzerda (masalan Telegram ichida) ochilsa ham ishlaydi.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/kirish?xato=havola&next=${encodeURIComponent(next)}`);
}
