import { createClient } from "@supabase/supabase-js";

// Service role — RLS'ni chetlab oʻtadi. Faqat serverda (Telegram webhook) ishlatiladi;
// har bir soʻrovni user_id bilan aniq cheklash shart.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(), (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
