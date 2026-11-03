import type { SupabaseClient } from "@supabase/supabase-js";
import { todayInTashkent, type ProgressUnit, type ReadingFormat, type ShelfStatus, type UserBook } from "@/lib/shelf-types";

// Javon amallari — sayt (RLS'li klient) va Telegram bot (service role) uchun umumiy.
// Bot RLS'ni chetlab oʻtgani uchun har bir soʻrov user_id bilan aniq cheklanadi.

// Yangi qoʻshilgan kitob uchun format va oʻlchov birligini kitob turidan taxmin qilamiz
export function defaultsFor(book: { formats: string[]; audio_seconds: number | null; page_count: number | null }): {
  format: ReadingFormat;
  unit: ProgressUnit;
  total_value: number | null;
} {
  // Qogʻoz nashri va betlar soni maʼlum boʻlsa — bet boʻyicha (jami avtomatik toʻladi)
  if (book.formats.includes("paper") && book.page_count) return { format: "paper", unit: "pages", total_value: book.page_count };
  if (book.formats.includes("ebook")) return { format: "ebook", unit: "percent", total_value: 100 };
  if (book.formats.includes("audio") && book.audio_seconds)
    return { format: "audio", unit: "minutes", total_value: Math.max(1, Math.ceil(book.audio_seconds / 60)) };
  return { format: "paper", unit: "pages", total_value: null };
}

function statusDates(status: ShelfStatus, existing?: Pick<UserBook, "started_at" | "finished_at">) {
  const today = todayInTashkent();
  return {
    started_at: status === "reading" || status === "read" ? (existing?.started_at ?? today) : (existing?.started_at ?? null),
    finished_at: status === "read" ? (existing?.finished_at ?? today) : null,
  };
}

export async function setStatusFor(db: SupabaseClient, userId: string, bookId: number, status: ShelfStatus) {
  const { data: existing } = await db
    .from("user_books")
    .select("id, status, started_at, finished_at, current_value, total_value")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = { status, ...statusDates(status, existing) };
    // "Oʻqidim" belgilansa progress 100% boʻladi
    if (status === "read" && existing.total_value) patch.current_value = existing.total_value;
    const { error } = await db.from("user_books").update(patch).eq("id", existing.id).eq("user_id", userId);
    return { ok: !error, userBookId: existing.id as number };
  }

  const { data: book } = await db.from("books").select("formats, audio_seconds, page_count").eq("id", bookId).maybeSingle();
  if (!book) return { ok: false, userBookId: null };
  const defaults = defaultsFor(book);
  const { data, error } = await db
    .from("user_books")
    .insert({
      user_id: userId,
      book_id: bookId,
      status,
      ...defaults,
      current_value: status === "read" && defaults.total_value ? defaults.total_value : 0,
      ...statusDates(status),
    })
    .select("id")
    .single();
  return { ok: !error, userBookId: (data?.id as number | undefined) ?? null };
}

export type ProgressInput = { format: ReadingFormat; unit: ProgressUnit; current: number; total: number };

export async function applyProgress(
  db: SupabaseClient,
  userId: string,
  userBookId: number,
  input: ProgressInput,
  source: "web" | "bot",
) {
  const total = input.unit === "percent" ? 100 : input.total;
  const current = Math.max(0, Math.min(input.current, total));

  const { data: ub } = await db
    .from("user_books")
    .select("id, status, unit, current_value, total_value, started_at, finished_at")
    .eq("id", userBookId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!ub) return null;

  // Oʻlchov birligi oʻzgargan boʻlsa (masalan bet -> daqiqa), eski joyni yangi birlikka proporsional oʻgirib farqni hisoblaymiz
  const previous =
    ub.unit === input.unit || !ub.total_value ? ub.current_value : Math.round((ub.current_value / ub.total_value) * total);
  const delta = current - previous;
  const finished = current >= total;
  // progress kiritilgan kitob — oʻqilyapti (yoki 100% boʻlsa tugatilgan)
  const status: ShelfStatus = finished ? "read" : "reading";

  const { error } = await db
    .from("user_books")
    .update({ format: input.format, unit: input.unit, current_value: current, total_value: total, status, ...statusDates(status, ub) })
    .eq("id", ub.id)
    .eq("user_id", userId);
  if (error) return null;

  if (delta !== 0) {
    await db.from("reading_sessions").insert({ user_id: userId, user_book_id: ub.id, delta, new_value: current, source });
  }
  return { current, total, delta, finished };
}
