"use server";

import { fetchExternalIsbnMeta, isbnVariants, type ExternalIsbnBook } from "@/lib/isbn";
import type { ShelfStatus } from "@/lib/shelf-types";
import { createPublicClient } from "@/lib/supabase/public";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

export type IsbnBook = {
  id: number;
  slug: string;
  title: string;
  author_names: string | null;
  cover_url: string | null;
  page_count: number | null;
  status: ShelfStatus | null; // foydalanuvchi javonidagi holati
};

export type IsbnResult =
  | { kind: "found"; isbn: string; book: IsbnBook }
  | { kind: "not_found"; isbn: string; external?: ExternalIsbnBook | null }
  | { kind: "invalid" };

const CARD = "id, slug, title, author_names, cover_url, page_count";

// Skaner yoki qoʻlda kiritilgan ISBN boʻyicha kitob: avval doʻkon nashrlari (book_sources), soʻng kitoblarning oʻzi
export async function lookupIsbn(raw: string): Promise<IsbnResult> {
  const variants = isbnVariants(String(raw ?? "").slice(0, 32));
  if (!variants) return { kind: "invalid" };
  const isbn = variants[0];
  const db = createPublicClient();

  let book: Omit<IsbnBook, "status"> | null = null;
  const { data: edition } = await db.from("book_sources").select(`books!inner(${CARD})`).in("isbn_digits", variants).limit(1).maybeSingle();
  if (edition) book = (edition as unknown as { books: Omit<IsbnBook, "status"> }).books;
  if (!book) {
    const { data } = await db.from("books").select(CARD).in("isbn_digits", variants).limit(1).maybeSingle();
    book = (data as Omit<IsbnBook, "status"> | null) ?? null;
  }
  if (!book) {
    const external = await fetchExternalIsbnMeta(isbn);
    return { kind: "not_found", isbn, external };
  }

  let status: ShelfStatus | null = null;
  const user = await getSessionUser();
  if (user) {
    const supabase = await createServerSupabase();
    const { data } = await supabase.from("user_books").select("status").eq("user_id", user.id).eq("book_id", book.id).maybeSingle();
    status = (data?.status as ShelfStatus | undefined) ?? null;
  }
  return { kind: "found", isbn, book: { ...book, status } };
}
