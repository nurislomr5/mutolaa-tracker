import { cache } from "react";
import { CARD_COLUMNS, type BookCardData } from "@/lib/catalog";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

// Tanishuv (sevimli ruknlar) va shaxsiy tavsiyalar — 20261114000016 migratsiyasi.
// Holat yopiq ustunda (profiles.onboarded_at), shuning uchun faqat my_onboarding() orqali oʻqiladi.

export type Onboarding = { onboarded: boolean; topicIds: number[] };

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;

// Xato boʻlsa null: tanishuv ixtiyoriy qadam — u ishlamasa ham sayt ishlashi kerak
async function readOnboarding(supabase: ServerSupabase): Promise<Onboarding | null> {
  const { data, error } = await supabase.rpc("my_onboarding").maybeSingle();
  if (error || !data) return null;
  const row = data as { onboarded: boolean; topic_ids: (number | string)[] | null };
  return { onboarded: row.onboarded, topicIds: (row.topic_ids ?? []).map(Number) };
}

export const getOnboarding = cache(async (): Promise<Onboarding | null> => {
  if (!(await getSessionUser())) return null;
  return readOnboarding(await createServerSupabase());
});

// Kirishdan keyin: aniq manzil soʻralmagan boʻlsa (standart — javon) va tanishuvdan oʻtilmagan boʻlsa — /tanishuv.
// supabase — hozirgina sessiya ochgan klient (cookie hali soʻrovga yozilmagan boʻlishi mumkin).
export async function afterLoginPath(supabase: ServerSupabase, next: string) {
  if (next !== "/javonim") return next;
  const state = await readOnboarding(supabase);
  return state && !state.onboarded ? "/tanishuv" : next;
}

// Bosh sahifadagi "Siz uchun": tanlangan ruknlar, javondagi kitoblar va kuzatilgan mualliflar asosida.
// Maʼlumot kam boʻlsa boʻsh qaytadi — sahifa bu boʻlimni koʻrsatmaydi.
export async function getRecommendedBooks(limit = 12): Promise<BookCardData[]> {
  if (!(await getSessionUser())) return [];
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("recommended_books", { p_limit: limit }).select(CARD_COLUMNS);
  if (error) {
    console.error("[tavsiyalar]", error.message);
    return [];
  }
  return (data ?? []) as unknown as BookCardData[];
}
