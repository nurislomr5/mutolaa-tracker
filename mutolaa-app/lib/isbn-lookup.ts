import type { SupabaseClient } from "@supabase/supabase-js";
import { isbnVariants } from "@/lib/isbn";

// ISBN boʻyicha katalogdagi kitob — sayt skaneri (app/actions/isbn.ts) va Telegram bot uchun umumiy.
// Avval doʻkon nashrlari (book_sources), soʻng kitoblarning oʻzi; ISBN-10 va ISBN-13 koʻrinishlari boʻyicha.

export type IsbnCatalogBook = {
  id: number;
  slug: string;
  title: string;
  author_names: string | null;
  cover_url: string | null;
  page_count: number | null;
};

const CARD = "id, slug, title, author_names, cover_url, page_count";

export async function findBookByIsbn(db: SupabaseClient, raw: string): Promise<{ isbn: string; book: IsbnCatalogBook | null } | null> {
  const variants = isbnVariants(String(raw ?? "").slice(0, 32));
  if (!variants) return null;

  const { data: edition } = await db.from("book_sources").select(`books!inner(${CARD})`).in("isbn_digits", variants).limit(1).maybeSingle();
  if (edition) return { isbn: variants[0], book: (edition as unknown as { books: IsbnCatalogBook }).books };

  const { data } = await db.from("books").select(CARD).in("isbn_digits", variants).limit(1).maybeSingle();
  return { isbn: variants[0], book: (data as IsbnCatalogBook | null) ?? null };
}
