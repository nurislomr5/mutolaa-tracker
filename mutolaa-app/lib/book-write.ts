import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookInput } from "@/lib/book-input";
import { COVER_BUCKET, COVER_MAX_BYTES, coverPathFromUrl, sniffImageType } from "@/lib/covers";
import { uz } from "@/lib/i18n/uz";
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

// ---------- Muqova yuklash (Supabase Storage, "covers" bucket) ----------

export type CoverUpload = { url: string } | { error: string } | null;

// Brauzer allaqachon kichraytirgan rasmni tekshirib yuklaydi. Fayl tanlanmagan boʻlsa — null.
export async function uploadCover(admin: SupabaseClient, userId: string, file: FormDataEntryValue | null): Promise<CoverUpload> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > COVER_MAX_BYTES) return { error: uz.addBook.coverTooBig };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return { error: uz.addBook.coverBadType };

  const path = `${userId}/${crypto.randomUUID()}.${type.split("/")[1].replace("jpeg", "jpg")}`;
  const { error } = await admin.storage.from(COVER_BUCKET).upload(path, bytes, { contentType: type, cacheControl: "31536000", upsert: false });
  if (error) return { error: uz.common.error };
  return { url: admin.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl };
}

// Bizning bucket'dagi eski muqovani oʻchirish (tashqi havolalarga tegilmaydi)
export async function removeCover(admin: SupabaseClient, url: string | null | undefined) {
  const path = coverPathFromUrl(url, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (path) await admin.storage.from(COVER_BUCKET).remove([path]);
}
