import { createClient } from "@supabase/supabase-js";

// Cookie'siz, anonim klient — faqat ochiq katalogni oʻqish uchun ('use cache' funksiyalar ichida ishlatiladi)
export function createPublicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
