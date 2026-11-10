// Kitobni tahrirlash qoidalari — sof funksiyalar (server action, sahifa va importerlar birga ishlatadi)

// Kim tahrirlay oladi: admin — har qanday kitobni; oddiy foydalanuvchi — faqat oʻzi qoʻshgan kitobni
export function canEditBook(
  book: { source: string; created_by: string | null },
  userId: string | null | undefined,
  isAdmin: boolean,
) {
  if (!userId) return false;
  if (isAdmin) return true;
  return book.source === "user" && book.created_by === userId;
}

// Mualliflar roʻyxati oʻzgarmagan boʻlsa — bogʻlanishlarga (book_authors) tegilmaydi:
// import qilingan kitoblarda ular manbadagi muallif sahifalariga ulangan
export function sameAuthors(stored: string | null | undefined, next: string[]) {
  const old = (stored ?? "").split(",").map((a) => a.trim()).filter(Boolean);
  return old.length === next.length && old.every((a, i) => a === next[i]);
}

// Saytda qoʻlda tahrirlangan kitob (books.edited_at toʻldirilgan): haftalik import bu maydonlarni qayta yozmaydi
export const EDIT_PROTECTED_FIELDS = ["title", "author_names", "description", "cover_url", "publisher"] as const;

export function keepEdited<T extends Record<string, unknown>>(incoming: T, existing: Record<string, unknown> | null | undefined): T {
  if (!existing?.edited_at) return incoming;
  const out: Record<string, unknown> = { ...incoming };
  for (const field of EDIT_PROTECTED_FIELDS) if (field in incoming && field in existing) out[field] = existing[field];
  return out as T;
}
