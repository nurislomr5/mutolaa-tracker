"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { bookInputSchema, parseAuthors } from "@/lib/book-input";
import { bookColumns, linkAuthors, resolvePublisher } from "@/lib/book-write";
import { uz } from "@/lib/i18n/uz";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/supabase/server";
import type { AddBookState } from "./add-book";

// Faqat foydalanuvchi qoʻshgan va aynan shu foydalanuvchiniki boʻlgan kitob tahrirlanadi.
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
  const { data: book } = await admin.from("books").select("id, source, created_by").eq("slug", input.slug).maybeSingle();
  if (!book || book.source !== "user" || book.created_by !== user.id) return { ok: false, error: uz.editBook.forbidden };

  const { error } = await admin
    .from("books")
    .update({ ...bookColumns(input, authors), ...(await resolvePublisher(admin, input.publisher)) })
    .eq("id", book.id);
  if (error) return { ok: false, error: uz.common.error };
  await linkAuthors(admin, book.id, authors, true);

  updateTag("catalog");
  redirect(`/kitob/${input.slug}`);
}
