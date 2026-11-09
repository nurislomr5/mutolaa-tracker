import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { applyProgress } from "@/lib/shelf-ops";
import { FORMATS, NOTE_TYPES, UNITS, type ProgressUnit, type ReadingFormat, type ShelfStatus } from "@/lib/shelf-types";

// Oflayn javon (/oflayn): telefonga saqlanadigan nusxa va internet qaytganda yuboriladigan amallar navbati.
// Server tomoni — app/api/offline/route.ts; mijoz — lib/offline-store.ts, components/offline/*.

export type OfflineBook = {
  id: number; // user_books.id
  bookId: number;
  slug: string;
  title: string;
  authors: string | null;
  cover: string | null;
  status: ShelfStatus;
  format: ReadingFormat | null;
  unit: ProgressUnit;
  current: number;
  total: number | null;
  updatedAt: string;
};

export type OfflineSnapshot = { userId: string; syncedAt: string; books: OfflineBook[] };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const offlineOpSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1).max(64),
    kind: z.literal("progress"),
    userBookId: z.number().int().positive(),
    format: z.enum(FORMATS),
    unit: z.enum(UNITS),
    current: z.number().int().min(0).max(1_000_000),
    total: z.number().int().positive().max(1_000_000),
    date,
  }),
  z.object({
    id: z.string().min(1).max(64),
    kind: z.literal("note"),
    userBookId: z.number().int().positive(),
    type: z.enum(NOTE_TYPES),
    reference: z.string().trim().max(100),
    content: z.string().trim().min(1).max(5_000),
  }),
]);
export type OfflineOp = z.infer<typeof offlineOpSchema>;
export const offlineOpsSchema = z.object({ ops: z.array(offlineOpSchema).min(1).max(100) });

// Oʻqiyotgan va oʻqimoqchi kitoblar — oflayn javonda progress kiritish va qayd yozish uchun
export async function buildSnapshot(db: SupabaseClient, userId: string): Promise<OfflineSnapshot> {
  const { data, error } = await db
    .from("user_books")
    .select("id, book_id, status, format, unit, current_value, total_value, updated_at, books!inner(slug, title, author_names, cover_url)")
    .eq("user_id", userId)
    .in("status", ["reading", "want"])
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Oflayn javon: ${error.message}`);
  type Row = {
    id: number;
    book_id: number;
    status: ShelfStatus;
    format: ReadingFormat | null;
    unit: ProgressUnit;
    current_value: number;
    total_value: number | null;
    updated_at: string;
    books: { slug: string; title: string; author_names: string | null; cover_url: string | null };
  };
  return {
    userId,
    syncedAt: new Date().toISOString(),
    books: ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      bookId: r.book_id,
      slug: r.books.slug,
      title: r.books.title,
      authors: r.books.author_names,
      cover: r.books.cover_url,
      status: r.status,
      format: r.format,
      unit: r.unit,
      current: r.current_value,
      total: r.total_value,
      updatedAt: r.updated_at,
    })),
  };
}

// Navbatdagi amallarni tartib bilan qoʻllaydi. Har biri egalik tekshiruvidan oʻtadi (user_id filtri + RLS).
// Qayta yuborish xavfsiz: progress — mutlaq qiymat (takrorda farq 0, sessiya yozilmaydi), qayd — bir xil matnli qayd bor boʻlsa oʻtkaziladi.
export async function applyOfflineOps(db: SupabaseClient, userId: string, ops: OfflineOp[]) {
  const results: { id: string; ok: boolean }[] = [];
  for (const op of ops) {
    if (op.kind === "progress") {
      const res = await applyProgress(db, userId, op.userBookId, { format: op.format, unit: op.unit, current: op.current, total: op.total, date: op.date }, "web");
      results.push({ id: op.id, ok: Boolean(res) });
      continue;
    }
    const { data: owned } = await db.from("user_books").select("id").eq("id", op.userBookId).eq("user_id", userId).maybeSingle();
    if (!owned) {
      results.push({ id: op.id, ok: false });
      continue;
    }
    const { data: dup } = await db
      .from("notes")
      .select("id")
      .eq("user_id", userId)
      .eq("user_book_id", op.userBookId)
      .eq("content", op.content)
      .limit(1);
    if (dup?.length) {
      results.push({ id: op.id, ok: true });
      continue;
    }
    const { error } = await db.from("notes").insert({
      user_id: userId,
      user_book_id: op.userBookId,
      type: op.type,
      reference_point: op.reference || null,
      content: op.content,
    });
    results.push({ id: op.id, ok: !error });
  }
  return results;
}
