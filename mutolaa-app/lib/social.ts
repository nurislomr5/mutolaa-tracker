import { cacheLife, cacheTag } from "next/cache";
import type { BookCardData } from "@/lib/catalog";
import type { ShelfStatus } from "@/lib/shelf-types";
import { createPublicClient } from "@/lib/supabase/public";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

// Ommaviy profillar, kuzatish va lenta. Koʻrinish qoidalari RLS'da (20261103000003_social.sql):
// faqat ochiq profillar (va oʻzingiz) koʻrinadi; qaydlar va sessiyalar har doim shaxsiy.

const BOOK_CARD = "id, slug, title, author_names, cover_url, formats, mutolaa_rating, audio_seconds, is_premium";

export type PublicPerson = { id: string; username: string; display_name: string | null; avatar_url: string | null };

export function personName(p: Pick<PublicPerson, "display_name" | "username">) {
  return p.display_name || `@${p.username}`;
}

type ShelfRow = {
  status: ShelfStatus;
  rating: number | null;
  review: string | null;
  review_is_spoiler: boolean;
  finished_at: string | null;
  updated_at: string;
  books: BookCardData;
};

export async function getPublicProfile(username: string) {
  const supabase = await createServerSupabase();
  const me = await getSessionUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, yearly_goal, is_public, created_at")
    .eq("username", username.toLowerCase())
    .maybeSingle();
  // RLS yopiq profilni faqat egasiga qaytaradi; egasi ham uni "ommaviy" sahifada koʻrmasin
  if (!profile || !profile.is_public) return null;

  const [{ data: shelf }, { count: followers }, { count: following }, { data: myFollow }, { data: myShelf }] = await Promise.all([
    supabase
      .from("user_books")
      .select(`status, rating, review, review_is_spoiler, finished_at, updated_at, books!inner(${BOOK_CARD})`)
      .eq("user_id", profile.id)
      .order("updated_at", { ascending: false }),
    supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profile.id),
    supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", profile.id),
    me
      ? supabase.from("follows").select("following_id").eq("follower_id", me.id).eq("following_id", profile.id).maybeSingle()
      : Promise.resolve({ data: null }),
    me && me.id !== profile.id
      ? supabase.from("user_books").select("book_id").eq("user_id", me.id)
      : Promise.resolve({ data: null }),
  ]);
  const rows = (shelf ?? []) as unknown as ShelfRow[];
  const year = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" }).slice(0, 4);
  const read = rows
    .filter((r) => r.status === "read")
    .sort((a, b) => (b.finished_at ?? "").localeCompare(a.finished_at ?? ""));

  let tasteMatch: { common: number; pct: number } | null = null;
  if (myShelf && myShelf.length > 0 && rows.length > 0) {
    const myIds = new Set(myShelf.map((r) => r.book_id as number));
    const theirIds = new Set(rows.map((r) => r.books.id));
    let common = 0;
    for (const id of theirIds) if (myIds.has(id)) common++;
    if (common > 0) {
      const denom = Math.max(1, Math.min(myIds.size, theirIds.size));
      tasteMatch = { common, pct: Math.min(100, Math.round((common / denom) * 100)) };
    }
  }

  return {
    profile: profile as PublicPerson & { yearly_goal: number | null; created_at: string },
    isSelf: me?.id === profile.id,
    isLoggedIn: Boolean(me),
    isFollowing: Boolean(myFollow),
    tasteMatch,
    followers: followers ?? 0,
    following: following ?? 0,
    reading: rows.filter((r) => r.status === "reading").map((r) => r.books),
    read: read.map((r) => ({ ...r.books, userRating: r.rating })),
    readThisYear: read.filter((r) => r.finished_at?.startsWith(year)).length,
    wantCount: rows.filter((r) => r.status === "want").length,
    reviews: rows
      .filter((r) => r.review)
      .map((r) => ({
        book: r.books,
        rating: r.rating,
        review: r.review!,
        isSpoiler: r.review_is_spoiler,
        date: r.finished_at ?? r.updated_at.slice(0, 10),
      })),
  };
}

export async function searchPublicUsers(q: string): Promise<PublicPerson[]> {
  const clean = q.trim().replace(/^@/, "").replace(/[%_,()]/g, "");
  if (!clean) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("is_public", true)
    .or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`)
    .limit(12);
  return (data ?? []) as PublicPerson[];
}

export type ActivityKind = ShelfStatus | "rated" | "reviewed";
export type FeedItem = {
  id: number;
  kind: ActivityKind;
  rating: number | null;
  created_at: string;
  person: PublicPerson;
  book: BookCardData;
};

// now — "2 soat oldin" hisoblash uchun soʻrov vaqti (komponentlar Date.now() chaqirmasin)
export async function getFeed(scope: "following" | "all", limit = 50): Promise<{ items: FeedItem[]; now: number }> {
  const now = Date.now();
  const me = await getSessionUser();
  if (!me) return { items: [], now };
  const supabase = await createServerSupabase();

  let ids: string[] | null = null;
  if (scope === "following") {
    const { data } = await supabase.from("follows").select("following_id").eq("follower_id", me.id);
    ids = (data ?? []).map((r) => r.following_id as string);
    if (!ids.length) return { items: [], now };
  }
  let query = supabase
    .from("activities")
    .select(`id, kind, rating, created_at, profiles!inner(id, username, display_name, avatar_url), books!inner(${BOOK_CARD})`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (ids) query = query.in("user_id", ids);
  const { data, error } = await query;
  if (error) throw new Error(`Lenta: ${error.message}`);
  const items = ((data ?? []) as unknown as (Omit<FeedItem, "person" | "book"> & { profiles: PublicPerson; books: BookCardData })[]).map(
    ({ profiles, books, ...a }) => ({ ...a, person: profiles, book: books }),
  );
  return { items, now };
}

export type BookReview = {
  id: number;
  person: PublicPerson;
  rating: number | null;
  review: string | null;
  isSpoiler: boolean;
  helpful: number;
  date: string;
};

// Kitob sahifasi: ochiq profilli oʻquvchilar baholari va taqrizlari (anonim klient — faqat ochiq maʼlumot)
export async function getBookReviews(bookId: number) {
  "use cache";
  cacheLife("minutes");
  cacheTag(`reviews:${bookId}`);

  const db = createPublicClient();
  const [{ data, error }, { data: votes }] = await Promise.all([
    db
      .from("user_books")
      .select("id, rating, review, review_is_spoiler, finished_at, updated_at, profiles!inner(id, username, display_name, avatar_url)")
    .eq("book_id", bookId)
    .or("rating.not.is.null,review.not.is.null")
      .order("updated_at", { ascending: false })
      .limit(50),
    // "Foydali" ovozlari soni (kim ovoz bergani oshkor qilinmaydi)
    db.rpc("review_helpful_counts", { p_book_id: bookId }),
  ]);
  if (error) throw new Error(`Taqrizlar: ${error.message}`);
  const helpful = new Map(((votes ?? []) as { user_book_id: number; helpful: number }[]).map((v) => [v.user_book_id, v.helpful]));
  const rows = (data ?? []) as unknown as {
    id: number;
    rating: number | null;
    review: string | null;
    review_is_spoiler: boolean;
    finished_at: string | null;
    updated_at: string;
    profiles: PublicPerson;
  }[];
  const rated = rows.filter((r) => r.rating != null);
  return {
    average: rated.length ? rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length : null,
    ratingCount: rated.length,
    // Eng foydali taqrizlar tepada; teng boʻlsa — yangilari (soʻrov tartibi saqlanadi)
    reviews: rows
      .map(
        (r): BookReview => ({
          id: r.id,
          person: r.profiles,
          rating: r.rating,
          review: r.review,
          isSpoiler: r.review_is_spoiler,
          helpful: helpful.get(r.id) ?? 0,
          date: r.finished_at ?? r.updated_at.slice(0, 10),
        }),
      )
      .sort((a, b) => b.helpful - a.helpful),
  };
}
