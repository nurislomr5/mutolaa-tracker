"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { uz } from "@/lib/i18n/uz";
import { setStatusFor } from "@/lib/shelf-ops";
import { STATUSES } from "@/lib/shelf-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";
import { slugify, uzNormalize } from "@/lib/text/normalize";

// Foydalanuvchi katalogda yoʻq kitobni qoʻshadi. Katalog jadvallariga (books, authors, book_authors) yozish
// service role bilan — foydalanuvchi tekshirilgandan va maʼlumot validatsiya qilingandan keyin.

const DAILY_LIMIT = 20;

export type DuplicateBook = { slug: string; title: string; author_names: string | null; cover_url: string | null };
export type AddBookState =
  | { ok: false; error: string; duplicates?: undefined }
  | { ok: false; error?: undefined; duplicates: DuplicateBook[] }
  | null;

const currentYear = new Date().getFullYear();
const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(min).max(max).optional());

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  authors: z.string().trim().min(1).max(300),
  formats: z.array(z.enum(["paper", "ebook", "audio"])).min(1),
  page_count: optionalInt(1, 10_000),
  publisher: z.string().trim().max(120).optional(),
  year: optionalInt(1500, currentYear + 1),
  isbn: z
    .string()
    .trim()
    .transform((v) => v.replace(/[^0-9Xx]/g, "").toUpperCase())
    .refine((v) => v === "" || v.length === 10 || v.length === 13, "ISBN 10 yoki 13 xonali boʻlishi kerak")
    .optional(),
  cover_url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), uz.addBook.coverHint)
    .optional(),
  description: z.string().trim().max(3000).optional(),
  status: z.enum(STATUSES),
  force: z.literal("1").optional(),
});

const BOOK_CARD = "slug, title, author_names, cover_url";

export async function addBook(_prev: AddBookState, formData: FormData): Promise<AddBookState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: uz.common.error };

  const parsed = schema.safeParse({ ...Object.fromEntries(formData), formats: formData.getAll("formats") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? uz.addBook.invalid };
  const input = parsed.data;
  const authors = [...new Set(input.authors.split(",").map((a) => a.trim()).filter(Boolean))].slice(0, 10);
  if (!authors.length) return { ok: false, error: uz.addBook.invalid };
  const isbn = input.isbn || null;

  const admin = createAdminClient();

  // Kunlik cheklov (spamga qarshi)
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin.from("books").select("id", { count: "exact", head: true }).eq("created_by", user.id).gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) return { ok: false, error: uz.addBook.rateLimit };

  // Takrorlar: ISBN yoki "nom + muallif" aniq mos keladiganlar, soʻng nomi oʻxshash kitoblar
  if (!input.force) {
    const found = new Map<string, DuplicateBook>();
    if (isbn) {
      // Manbalarda ISBN chiziqchali saqlanadi ("978-9943-23-194-8") — raqamlar ketma-ketligi boʻyicha solishtiramiz
      const pattern = isbn.split("").join("%");
      const { data } = await admin.from("books").select(BOOK_CARD).like("isbn", pattern).limit(3);
      for (const b of data ?? []) found.set(b.slug, b);
      const { data: editions } = await admin.from("book_sources").select(`books!inner(${BOOK_CARD})`).like("isbn", pattern).limit(3);
      for (const e of (editions ?? []) as unknown as { books: DuplicateBook }[]) found.set(e.books.slug, e.books);
    }
    const { data: exact } = await admin.from("books").select(BOOK_CARD).eq("search_text", uzNormalize(`${input.title} ${authors.join(", ")}`)).limit(3);
    for (const b of exact ?? []) found.set(b.slug, b);
    const normTitle = uzNormalize(input.title);
    const { data: similar } = await admin.rpc("search_books", { q: `${input.title} ${authors[0]}` }).select(`${BOOK_CARD}, search_text`).limit(5);
    for (const b of (similar ?? []) as (DuplicateBook & { search_text: string })[]) {
      if (normTitle.length >= 3 && b.search_text.includes(normTitle)) found.set(b.slug, { slug: b.slug, title: b.title, author_names: b.author_names, cover_url: b.cover_url });
    }
    if (found.size) return { ok: false, duplicates: [...found.values()].slice(0, 4) };
  }

  // Nashriyot katalogda boʻlsa — bogʻlaymiz, aks holda matn sifatida saqlaymiz
  let publisherId: number | null = null;
  if (input.publisher) {
    const { data } = await admin.from("publishers").select("id").eq("slug", slugify(input.publisher)).maybeSingle();
    publisherId = data?.id ?? null;
  }

  const base = slugify(`${input.title} ${authors[0]}`) || "kitob";
  let slug = base;
  for (let i = 2; ; i++) {
    const { data } = await admin.from("books").select("id").eq("slug", slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${i}`;
  }

  const { data: book, error } = await admin
    .from("books")
    .insert({
      slug,
      title: input.title,
      author_names: authors.join(", "),
      description: input.description || null,
      cover_url: input.cover_url || null,
      formats: input.formats,
      page_count: input.page_count ?? null,
      published_year: input.year ?? null,
      isbn,
      publisher_id: publisherId,
      publisher: publisherId ? null : input.publisher || null,
      source: "user",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !book) return { ok: false, error: uz.common.error };

  // Mualliflar: mavjudlarini qayta yozmasdan bogʻlaymiz
  const authorRows = authors.map((name) => ({ name, slug: slugify(name) })).filter((a) => a.slug);
  if (authorRows.length) {
    await admin.from("authors").upsert(authorRows, { onConflict: "slug", ignoreDuplicates: true });
    const { data: ids } = await admin.from("authors").select("id, slug").in("slug", authorRows.map((a) => a.slug));
    const bySlug = new Map((ids ?? []).map((a) => [a.slug, a.id]));
    const links = authorRows.map((a, i) => ({ book_id: book.id, author_id: bySlug.get(a.slug), position: i })).filter((l) => l.author_id);
    if (links.length) await admin.from("book_authors").insert(links);
  }

  // Qoʻshgan foydalanuvchining javoniga (RLS'li oʻz klienti bilan)
  await setStatusFor(await createServerSupabase(), user.id, book.id, input.status);

  // katalog, qidiruv va bosh sahifa keshlari yangi kitobni darhol koʻrsatsin
  updateTag("catalog");
  redirect(`/kitob/${slug}`);
}
