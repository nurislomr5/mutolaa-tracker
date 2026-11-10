"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin";
import { canEditBook, sameAuthors } from "@/lib/book-edit";
import { bookInputSchema, parseAuthors } from "@/lib/book-input";
import { bookColumns, linkAuthors, removeCover, resolvePublisher, uploadCover } from "@/lib/book-write";
import { uz } from "@/lib/i18n/uz";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/supabase/server";
import type { AddBookState } from "./add-book";

// Oddiy foydalanuvchi faqat oʻzi qoʻshgan kitobni, admin esa har qanday kitobni tahrirlaydi.
// Slug oʻzgarmaydi — kitobga eski havolalar ishlayveradi.
const schema = bookInputSchema.extend({ slug: z.string().min(1).max(200) });

export async function editBook(_prev: AddBookState, formData: FormData): Promise<AddBookState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: uz.common.error };

  const parsed = schema.safeParse({ ...Object.fromEntries(formData), formats: formData.getAll("formats") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? uz.addBook.invalid };
  const input = parsed.data;
  const authors = parseAuthors(input.authors);
  if (!authors.length) return { ok: false, error: uz.addBook.invalid };

  const admin = createAdminClient();
  const { data: book } = await admin.from("books").select("id, source, created_by, cover_url, author_names").eq("slug", input.slug).maybeSingle();
  if (!book) return { ok: false, error: uz.editBook.forbidden };
  // Admin tekshiruvi (qoʻshimcha soʻrov) faqat kitob egasi boʻlmaganlar uchun
  if (!canEditBook(book, user.id, false) && !(await getAdminUser())) return { ok: false, error: uz.editBook.forbidden };

  const cover = await uploadCover(admin, user.id, formData.get("cover_file"));
  if (cover && "error" in cover) return { ok: false, error: cover.error };
  const columns = { ...bookColumns(input, authors), ...(cover ? { cover_url: cover.url } : {}) };

  const { error } = await admin
    .from("books")
    .update({ ...columns, ...(await resolvePublisher(admin, input.publisher)) })
    .eq("id", book.id);
  if (error) {
    await removeCover(admin, cover?.url);
    return { ok: false, error: uz.common.error };
  }
  // Muqova almashgan yoki olib tashlangan boʻlsa — bizning bucket'dagi eski faylni oʻchiramiz
  if (book.cover_url && book.cover_url !== columns.cover_url) await removeCover(admin, book.cover_url);
  // Mualliflar oʻzgargandagina qayta bogʻlaymiz — import qilingan kitoblarning muallif sahifalari uzilmasin
  if (!sameAuthors(book.author_names, authors)) await linkAuthors(admin, book.id, authors, true);
  // Qoʻlda tahrirlangan deb belgilaymiz: haftalik import bu kitobning tuzatilgan maydonlarini qayta yozmaydi.
  // Ustun (migratsiya 018) hali qoʻshilmagan boʻlsa xato eʼtiborsiz qoldiriladi — tahrirning oʻzi saqlangan.
  await admin.from("books").update({ edited_at: new Date().toISOString() }).eq("id", book.id);

  updateTag("catalog");
  updateTag(`book:${input.slug}`);
  // Server redirect oʻrniga manzilni qaytaramiz — forma sahifani toʻliq qayta yuklaydi.
  // Sabab: action'dan keyingi client yoʻnaltirishda muqova olib tashlanganda eski rasm DOM'da qolib ketardi.
  return { ok: true, redirectTo: `/kitob/${input.slug}` };
}
