"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { bookInputSchema, parseAuthors } from "@/lib/book-input";
import { bookColumns, linkAuthors, removeCover, resolvePublisher, uploadCover } from "@/lib/book-write";
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
  | { ok: true; redirectTo: string; error?: undefined; duplicates?: undefined }
  | null;

const schema = bookInputSchema.extend({
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
  const authors = parseAuthors(input.authors);
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

  const base = slugify(`${input.title} ${authors[0]}`) || "kitob";
  let slug = base;
  for (let i = 2; ; i++) {
    const { data } = await admin.from("books").select("id").eq("slug", slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${i}`;
  }

  // Muqova faqat kitob haqiqatan yaratilayotganda yuklanadi (takror topilganda ortiqcha fayl qolmasin)
  const cover = await uploadCover(admin, user.id, formData.get("cover_file"));
  if (cover && "error" in cover) return { ok: false, error: cover.error };

  const { data: book, error } = await admin
    .from("books")
    .insert({
      slug,
      ...bookColumns(input, authors),
      ...(cover ? { cover_url: cover.url } : {}),
      ...(await resolvePublisher(admin, input.publisher)),
      source: "user",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !book) {
    await removeCover(admin, cover?.url);
    return { ok: false, error: uz.common.error };
  }
  await linkAuthors(admin, book.id, authors);

  // Qoʻshgan foydalanuvchining javoniga (RLS'li oʻz klienti bilan)
  await setStatusFor(await createServerSupabase(), user.id, book.id, input.status);

  // katalog, qidiruv va bosh sahifa keshlari yangi kitobni darhol koʻrsatsin
  updateTag("catalog");
  redirect(`/kitob/${slug}`);
}
