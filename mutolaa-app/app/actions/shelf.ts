"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { uz } from "@/lib/i18n/uz";
import { applyProgress, setStatusFor } from "@/lib/shelf-ops";
import { FORMATS, joinNoteAnswer, NOTE_TYPES, parseReviewSpoiler, SPOILER_PREFIX, STATUSES, UNITS } from "@/lib/shelf-types";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

// Barcha amallar: foydalanuvchini tekshirish -> zod bilan validatsiya -> yozish (RLS + user_id filtri himoya qiladi) -> sahifani yangilash.
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const fail = (error: string = uz.common.error): ActionResult => ({ ok: false, error });

async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("Kirish talab qilinadi");
  return { user, supabase: await createServerSupabase() };
}

const id = z.coerce.number().int().positive();

export async function setShelfStatus(bookId: number, status: string): Promise<ActionResult> {
  const parsed = z.object({ bookId: id, status: z.enum(STATUSES) }).safeParse({ bookId, status });
  if (!parsed.success) return fail();
  const { user, supabase } = await requireUser();
  const result = await setStatusFor(supabase, user.id, parsed.data.bookId, parsed.data.status);
  if (!result.ok) return fail();
  updateTag(`reviews:${parsed.data.bookId}`);
  refresh();
  return { ok: true };
}

export async function removeFromShelf(userBookId: number): Promise<ActionResult> {
  const parsed = id.safeParse(userBookId);
  if (!parsed.success) return fail();
  const { user, supabase } = await requireUser();
  const { data, error } = await supabase
    .from("user_books")
    .delete()
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .select("book_id")
    .maybeSingle();
  if (error) return fail();
  if (data?.book_id) updateTag(`reviews:${data.book_id}`);
  refresh();
  return { ok: true };
}

const progressSchema = z.object({
  userBookId: id,
  format: z.enum(FORMATS),
  unit: z.enum(UNITS),
  current: z.coerce.number().int().min(0).max(1_000_000),
  total: z.coerce.number().int().positive().max(1_000_000),
  date: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)),
});

export async function updateProgress(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = progressSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Qiymatlarni tekshiring.");
  const { userBookId, ...input } = parsed.data;
  const { user, supabase } = await requireUser();
  const result = await applyProgress(supabase, user.id, userBookId, input, "web");
  if (!result) return fail();
  refresh();
  return { ok: true, message: result.finished ? "🎉 Kitob tugatildi!" : uz.shelf.saved };
}

export async function deleteReadingSession(sessionId: number): Promise<ActionResult> {
  const parsed = id.safeParse(sessionId);
  if (!parsed.success) return fail();
  const { user, supabase } = await requireUser();
  const { error } = await supabase.from("reading_sessions").delete().eq("id", parsed.data).eq("user_id", user.id);
  if (error) return fail();
  refresh();
  return { ok: true };
}

export async function setRating(userBookId: number, rating: number | null): Promise<ActionResult> {
  const parsed = z
    .object({ userBookId: id, rating: z.number().min(0.5).max(5).multipleOf(0.5).nullable() })
    .safeParse({ userBookId, rating });
  if (!parsed.success) return fail();
  const { user, supabase } = await requireUser();
  const { data, error } = await supabase
    .from("user_books")
    .update({ rating: parsed.data.rating })
    .eq("id", parsed.data.userBookId)
    .eq("user_id", user.id)
    .select("book_id")
    .maybeSingle();
  if (error) return fail();
  if (data?.book_id) updateTag(`reviews:${data.book_id}`);
  refresh();
  return { ok: true };
}

export async function saveReview(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ userBookId: id, review: z.string().max(10_000) })
    .safeParse({ userBookId: formData.get("userBookId"), review: formData.get("review") ?? "" });
  if (!parsed.success) return fail();
  const { user, supabase } = await requireUser();
  const cleanText = parseReviewSpoiler(parsed.data.review).text;
  const isSpoiler = formData.get("is_spoiler") === "on" || formData.get("is_spoiler") === "true";
  const review = cleanText ? (isSpoiler ? `${SPOILER_PREFIX}${cleanText}` : cleanText) : null;
  const { data, error } = await supabase
    .from("user_books")
    .update({ review })
    .eq("id", parsed.data.userBookId)
    .eq("user_id", user.id)
    .select("book_id")
    .maybeSingle();
  if (error) return fail();
  if (data?.book_id) updateTag(`reviews:${data.book_id}`);
  refresh();
  return { ok: true, message: uz.shelf.saved };
}

// ---------- Qaydlar ----------

export async function addNote(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({
      userBookId: id,
      type: z.enum(NOTE_TYPES),
      reference: z.string().trim().max(100),
      content: z.string().trim().min(1).max(5_000),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Qayd matnini kiriting.");
  const { user, supabase } = await requireUser();
  const { error } = await supabase.from("notes").insert({
    user_id: user.id,
    user_book_id: parsed.data.userBookId,
    type: parsed.data.type,
    reference_point: parsed.data.reference || null,
    content: parsed.data.content,
  });
  if (error) return fail();
  refresh();
  return { ok: true, message: uz.shelf.saved };
}

export async function setNoteResolved(noteId: number, resolved: boolean): Promise<ActionResult> {
  const parsed = z.object({ noteId: id, resolved: z.boolean() }).safeParse({ noteId, resolved });
  if (!parsed.success) return fail();
  const { user, supabase } = await requireUser();
  const { error } = await supabase.from("notes").update({ is_resolved: parsed.data.resolved }).eq("id", parsed.data.noteId).eq("user_id", user.id);
  if (error) return fail();
  refresh();
  return { ok: true };
}

export async function saveNoteAnswer(noteId: number, answer: string): Promise<ActionResult> {
  const parsed = z.object({ noteId: id, answer: z.string().max(2_500) }).safeParse({ noteId, answer });
  if (!parsed.success) return fail();
  const { user, supabase } = await requireUser();
  const { data: note } = await supabase
    .from("notes")
    .select("content")
    .eq("id", parsed.data.noteId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!note) return fail();
  const nextContent = joinNoteAnswer(note.content, parsed.data.answer);
  const { error } = await supabase
    .from("notes")
    .update({ content: nextContent, is_resolved: Boolean(parsed.data.answer.trim()) })
    .eq("id", parsed.data.noteId)
    .eq("user_id", user.id);
  if (error) return fail();
  refresh();
  return { ok: true };
}

export async function deleteNote(noteId: number): Promise<ActionResult> {
  const parsed = id.safeParse(noteId);
  if (!parsed.success) return fail();
  const { user, supabase } = await requireUser();
  const { error } = await supabase.from("notes").delete().eq("id", parsed.data).eq("user_id", user.id);
  if (error) return fail();
  refresh();
  return { ok: true };
}

// ---------- Maxsus javonlar ----------

export async function createShelf(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ name: z.string().trim().min(1).max(60), bookId: id.optional() })
    .safeParse({ name: formData.get("name"), bookId: formData.get("bookId") || undefined });
  if (!parsed.success) return fail("Javon nomini kiriting.");
  const { user, supabase } = await requireUser();
  const { data: shelf, error } = await supabase
    .from("shelves")
    .insert({ user_id: user.id, name: parsed.data.name })
    .select("id")
    .single();
  if (error) return fail(error.code === "23505" ? "Bunday nomli javon bor." : undefined);
  if (parsed.data.bookId) await supabase.from("shelf_books").insert({ shelf_id: shelf.id, book_id: parsed.data.bookId });
  refresh();
  return { ok: true };
}

export async function toggleShelfBook(shelfId: number, bookId: number, add: boolean): Promise<ActionResult> {
  const parsed = z.object({ shelfId: id, bookId: id, add: z.boolean() }).safeParse({ shelfId, bookId, add });
  if (!parsed.success) return fail();
  const { supabase } = await requireUser();
  const { error } = parsed.data.add
    ? await supabase.from("shelf_books").upsert({ shelf_id: parsed.data.shelfId, book_id: parsed.data.bookId })
    : await supabase.from("shelf_books").delete().eq("shelf_id", parsed.data.shelfId).eq("book_id", parsed.data.bookId);
  if (error) return fail();
  refresh();
  return { ok: true };
}

export async function deleteShelf(shelfId: number): Promise<ActionResult> {
  const parsed = id.safeParse(shelfId);
  if (!parsed.success) return fail();
  const { user, supabase } = await requireUser();
  const { error } = await supabase.from("shelves").delete().eq("id", parsed.data).eq("user_id", user.id);
  if (error) return fail();
  refresh();
  return { ok: true };
}
