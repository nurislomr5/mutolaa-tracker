import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookInput } from "@/lib/book-input";
import { publisherSlug } from "@/lib/publishers";
import { slugify } from "@/lib/text/normalize";

// Foydalanuvchi kitobini katalogga yozish (service role klient bilan, faqat server action'lardan)

// Nashriyot katalogda boʻlsa — bogʻlaymiz, aks holda matn sifatida saqlaymiz (yangi nashriyot yaratmaymiz)
export async function resolvePublisher(admin: SupabaseClient, name: string | undefined) {
  if (!name) return { publisher_id: null, publisher: null };
  const { data } = await admin.from("publishers").select("id").eq("slug", publisherSlug(name)).maybeSingle();
  return data ? { publisher_id: data.id as number, publisher: null } : { publisher_id: null, publisher: name };
}

export function bookColumns(input: BookInput, authors: string[]) {
  return {
    title: input.title,
    author_names: authors.join(", "),
    description: input.description || null,
    cover_url: input.cover_url || null,
    formats: input.formats,
    page_count: input.page_count ?? null,
    published_year: input.year ?? null,
    isbn: input.isbn || null,
  };
}

// Mualliflarni bogʻlash: mavjudlarini qayta yozmaymiz; replace — eski bogʻlanishlarni olib tashlash (tahrirlashda)
export async function linkAuthors(admin: SupabaseClient, bookId: number, authors: string[], replace = false) {
  if (replace) await admin.from("book_authors").delete().eq("book_id", bookId);
  const rows = authors.map((name) => ({ name, slug: slugify(name) })).filter((a) => a.slug);
  if (!rows.length) return;
  await admin.from("authors").upsert(rows, { onConflict: "slug", ignoreDuplicates: true });
  const { data } = await admin.from("authors").select("id, slug").in("slug", rows.map((a) => a.slug));
  const bySlug = new Map((data ?? []).map((a) => [a.slug, a.id]));
  const links = rows.map((a, i) => ({ book_id: bookId, author_id: bySlug.get(a.slug), position: i })).filter((l) => l.author_id);
  if (links.length) await admin.from("book_authors").insert(links);
}
