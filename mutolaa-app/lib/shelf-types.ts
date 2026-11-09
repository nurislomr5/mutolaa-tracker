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
  review_is_spoiler: boolean;
  updated_at: string;
};

export type Note = {
  id: number;
  user_book_id: number;
  type: NoteType;
  reference_point: string | null;
  content: string;
  answer: string | null;
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

// Toshkent vaqti boʻyicha bugungi sana (YYYY-MM-DD)
export function todayInTashkent() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
}
