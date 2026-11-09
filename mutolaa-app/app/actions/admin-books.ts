"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin";
import { uz } from "@/lib/i18n/uz";
import { createAdminClient } from "@/lib/supabase/admin";

// Takroriy kitoblarni birlashtirish (admin). Hamma oʻzgarish bazadagi merge_books funksiyasida — bitta tranzaksiyada.

export type AdminResult = { ok: true; message: string } | { ok: false; error: string };

const pairSchema = z.object({ target: z.number().int().positive(), source: z.number().int().positive() }).refine((p) => p.target !== p.source);

export async function mergeBooks(target: number, source: number): Promise<AdminResult> {
  if (!(await getAdminUser())) return { ok: false, error: uz.admin.forbidden };
  const parsed = pairSchema.safeParse({ target, source });
  if (!parsed.success) return { ok: false, error: uz.common.error };

  const { data, error } = await createAdminClient().rpc("merge_books", { p_target: parsed.data.target, p_source: parsed.data.source });
  if (error) return { ok: false, error: /Mutolaa/.test(error.message) ? uz.admin.mutolaaTarget : uz.common.error };

  const r = data as { target_slug: string; source_slug: string; moved_users: number; merged_users: number };
  // Katalog keshi (roʻyxatlar, kitob sahifalari), ikkala kitobning sahifasi va sharhlari
  updateTag("catalog");
  updateTag(`book:${r.target_slug}`);
  updateTag(`book:${r.source_slug}`);
  updateTag(`reviews:${parsed.data.target}`);
  updateTag(`reviews:${parsed.data.source}`);
  refresh();
  return { ok: true, message: uz.admin.merged(r.moved_users + r.merged_users) };
}

export async function dismissDuplicate(a: number, b: number): Promise<AdminResult> {
  if (!(await getAdminUser())) return { ok: false, error: uz.admin.forbidden };
  const parsed = pairSchema.safeParse({ target: a, source: b });
  if (!parsed.success) return { ok: false, error: uz.common.error };
  const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
  const { error } = await createAdminClient()
    .from("book_duplicate_dismissals")
    .upsert({ book_a: lo, book_b: hi }, { onConflict: "book_a,book_b", ignoreDuplicates: true });
  if (error) return { ok: false, error: uz.common.error };
  refresh();
  return { ok: true, message: uz.admin.dismissed };
}
