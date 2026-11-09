// Javon konstantalari va tiplari — client komponentlar ham import qiladi, shuning uchun server kodisiz.

export const STATUSES = ["reading", "want", "read", "dnf"] as const;
export type ShelfStatus = (typeof STATUSES)[number];
export const FORMATS = ["paper", "ebook", "audio"] as const;
export type ReadingFormat = (typeof FORMATS)[number];
export const UNITS = ["pages", "minutes", "percent"] as const;
export type ProgressUnit = (typeof UNITS)[number];
export const NOTE_TYPES = ["iqtibos", "savol", "lugat", "xulosa", "taymkod"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export type UserBook = {
  id: number;
  book_id: number;
  status: ShelfStatus;
  format: ReadingFormat | null;
  unit: ProgressUnit;
  current_value: number;
  total_value: number | null;
  started_at: string | null;
  finished_at: string | null;
  rating: number | null;
  review: string | null;
  updated_at: string;
};

export type Note = {
  id: number;
  user_book_id: number;
  type: NoteType;
  reference_point: string | null;
  content: string;
  is_resolved: boolean;
  created_at: string;
};

export type ReadingSession = {
  id: number;
  user_book_id: number;
  delta: number;
  new_value: number;
  source: "web" | "bot";
  created_at: string;
};

export type Shelf = { id: number; name: string; count: number };

export const SPOILER_PREFIX = "[spoiler]\n";

export function parseReviewSpoiler(raw: string | null | undefined): { text: string; isSpoiler: boolean } {
  if (!raw) return { text: "", isSpoiler: false };
  if (raw.startsWith(SPOILER_PREFIX)) return { text: raw.slice(SPOILER_PREFIX.length), isSpoiler: true };
  return { text: raw, isSpoiler: false };
}

export const ANSWER_MARKER = "\n\n💡 Javob: ";

export function splitNoteAnswer(content: string): { body: string; answer: string | null } {
  const idx = content.indexOf(ANSWER_MARKER);
  if (idx < 0) return { body: content, answer: null };
  return {
    body: content.slice(0, idx).trim(),
    answer: content.slice(idx + ANSWER_MARKER.length).trim() || null,
  };
}

export function joinNoteAnswer(body: string, answer: string | null | undefined): string {
  const cleanBody = splitNoteAnswer(body).body;
  const cleanAnswer = (answer ?? "").trim();
  return cleanAnswer ? `${cleanBody}${ANSWER_MARKER}${cleanAnswer}` : cleanBody;
}

// Toshkent vaqti boʻyicha bugungi sana (YYYY-MM-DD)
export function todayInTashkent() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
}
