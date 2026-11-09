"use server";

import { fetchExternalIsbnMeta, type ExternalIsbnBook } from "@/lib/isbn";
import { findBookByIsbn } from "@/lib/isbn-lookup";
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

// Skaner yoki qoʻlda kiritilgan ISBN boʻyicha kitob (qidiruv — lib/isbn-lookup.ts) + foydalanuvchi javonidagi holati
export async function lookupIsbn(raw: string): Promise<IsbnResult> {
  const found = await findBookByIsbn(createPublicClient(), raw);
  if (!found) return { kind: "invalid" };
  const { isbn, book } = found;
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
