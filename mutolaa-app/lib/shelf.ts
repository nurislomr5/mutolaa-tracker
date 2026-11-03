import { cache } from "react";
import type { BookCardData } from "@/lib/catalog";
import type { Note, NoteType, Shelf, ShelfStatus, UserBook } from "@/lib/shelf-types";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

export * from "@/lib/shelf-types";

// Foydalanuvchiga xos maʼlumot — keshlanmaydi. Ochiq profillar javoni boshqalarga ham oʻqiladi (RLS),
// shuning uchun user_books/profiles soʻrovlari har doim joriy foydalanuvchi bilan aniq cheklanadi.

const USER_BOOK_COLUMNS =
  "id, book_id, status, format, unit, current_value, total_value, started_at, finished_at, rating, review, updated_at";
const BOOK_CARD = "id, slug, title, author_names, cover_url, formats, mutolaa_rating, audio_seconds, is_premium";


// Kitob sahifasida ikki joyda ishlatiladi — bitta soʻrov ichida bir marta bajariladi
export const getBookShelfState = cache(async (bookId: number) => {
  const user = await getSessionUser();
  if (!user) return { userBook: null, notes: [] as Note[], shelves: [], shelfIds: new Set<number>() };
  const supabase = await createServerSupabase();
  const [{ data: userBook }, { data: shelves }, { data: inShelves }] = await Promise.all([
    supabase.from("user_books").select(USER_BOOK_COLUMNS).eq("user_id", user.id).eq("book_id", bookId).maybeSingle(),
    supabase.from("shelves").select("id, name").order("created_at"),
    supabase.from("shelf_books").select("shelf_id").eq("book_id", bookId),
  ]);
  let notes: Note[] = [];
  if (userBook) {
    const { data } = await supabase
      .from("notes")
      .select("id, user_book_id, type, reference_point, content, is_resolved, created_at")
      .eq("user_book_id", userBook.id)
      .order("created_at", { ascending: false });
    notes = (data ?? []) as Note[];
  }
  return {
    userBook: (userBook as UserBook | null) ?? null,
    notes,
    shelves: (shelves ?? []) as { id: number; name: string }[],
    shelfIds: new Set((inShelves ?? []).map((r) => r.shelf_id as number)),
  };
});

export type ShelfItem = UserBook & { book: BookCardData };

export async function getShelfItems({ status, shelfId }: { status?: ShelfStatus; shelfId?: number }) {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createServerSupabase();
  let query = supabase
    .from("user_books")
    .select(`${USER_BOOK_COLUMNS}, books!inner(${BOOK_CARD}${shelfId ? ", shelf_books!inner(shelf_id)" : ""})`)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (shelfId) query = query.eq("books.shelf_books.shelf_id", shelfId);
  const { data, error } = await query;
  if (error) throw new Error(`Javon: ${error.message}`);
  return ((data ?? []) as unknown as (UserBook & { books: BookCardData })[]).map(({ books, ...ub }) => ({ ...ub, book: books }));
}

export async function getStatusCounts() {
  const counts: Record<ShelfStatus, number> = { reading: 0, want: 0, read: 0, dnf: 0 };
  const user = await getSessionUser();
  if (!user) return counts;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("user_books").select("status").eq("user_id", user.id);
  if (error) throw new Error(`Javon: ${error.message}`);
  for (const r of data ?? []) counts[r.status as ShelfStatus]++;
  return counts;
}

export async function getShelves(): Promise<Shelf[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("shelves").select("id, name, shelf_books(count)").order("created_at");
  if (error) throw new Error(`Javonlar: ${error.message}`);
  return ((data ?? []) as unknown as { id: number; name: string; shelf_books: { count: number }[] }[]).map((s) => ({
    id: s.id,
    name: s.name,
    count: s.shelf_books[0]?.count ?? 0,
  }));
}

export type NoteWithBook = Note & { book: { slug: string; title: string } };

export async function getNotes({ type, openOnly }: { type?: NoteType; openOnly?: boolean }) {
  const supabase = await createServerSupabase();
  let query = supabase
    .from("notes")
    .select("id, user_book_id, type, reference_point, content, is_resolved, created_at, user_books!inner(books!inner(slug, title))")
    .order("created_at", { ascending: false });
  if (type) query = query.eq("type", type);
  if (openOnly) query = query.eq("type", "savol").eq("is_resolved", false);
  const { data, error } = await query;
  if (error) throw new Error(`Qaydlar: ${error.message}`);
  return ((data ?? []) as unknown as (Note & { user_books: { books: { slug: string; title: string } } })[]).map(
    ({ user_books, ...n }) => ({ ...n, book: user_books.books }),
  );
}

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  yearly_goal: number | null;
  is_public: boolean;
};

export async function getProfile(): Promise<Profile | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, yearly_goal, is_public")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

export async function isTelegramLinked() {
  const user = await getSessionUser();
  if (!user) return false;
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("telegram_accounts").select("user_id").eq("user_id", user.id).maybeSingle();
  return Boolean(data);
}
