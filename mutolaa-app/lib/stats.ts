import type { BookCardData } from "@/lib/catalog";
import type { ReadingFormat, ShelfStatus } from "@/lib/shelf-types";
import { todayInTashkent } from "@/lib/shelf-types";
import { computeStreaks, isLeapYear } from "@/lib/stats-utils";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

// Foydalanuvchining yillik statistikasi. Hisob-kitob serverda, Toshkent vaqti boʻyicha.

type BookRow = {
  status: ShelfStatus;
  format: ReadingFormat | null;
  started_at: string | null;
  finished_at: string | null;
  rating: number | null;
  books: BookCardData & { book_topics: { topics: { name: string; slug: string } }[] };
};

// get_user_year_stats (20261109000009): sessiyalar bazada Toshkent kunlariga yigʻiladi.
// activity joriy yilda streak uchun oxirgi 400 kunni ham oʻz ichiga oladi.
type DbYearStats = { activity: Record<string, number>; pages: number; minutes: number };

export type YearStats = {
  year: number;
  years: number[];
  isCurrentYear: boolean;
  goal: number | null;
  finished: (BookCardData & { finished_at: string; rating: number | null })[];
  expectedByToday: number | null;
  monthly: number[];
  pages: number;
  minutes: number;
  activity: Record<string, number>; // kun -> oʻqish sessiyalari soni
  activeDays: number;
  streak: { current: number; longest: number };
  readingNow: number;
  avgRating: number | null;
  byFormat: { format: ReadingFormat; count: number }[];
  byTopic: { name: string; slug: string; count: number }[];
};

export async function getYearStats(requestedYear?: number): Promise<YearStats> {
  const user = await getSessionUser();
  if (!user) throw new Error("Kirish talab qilinadi");
  const supabase = await createServerSupabase();
  const today = todayInTashkent();
  const currentYear = Number(today.slice(0, 4));
  const year = requestedYear && requestedYear >= 2000 && requestedYear <= currentYear ? requestedYear : currentYear;

  const [{ data: books, error }, { data: profile }, { data: dbStats, error: statsError }] = await Promise.all([
    supabase
      .from("user_books")
      .select(
        "status, format, started_at, finished_at, rating, books!inner(id, slug, title, author_names, cover_url, formats, mutolaa_rating, audio_seconds, is_premium, book_topics(topics(name, slug)))",
      )
      .eq("user_id", user.id),
    supabase.from("profiles").select("yearly_goal").eq("id", user.id).maybeSingle(),
    supabase.rpc("get_user_year_stats", { p_year: year }),
  ]);
  if (error) throw new Error(`Javon: ${error.message}`);
  if (statsError) throw new Error(`Sessiyalar: ${statsError.message}`);
  const rows = (books ?? []) as unknown as BookRow[];

  const finishedRows = rows
    .filter((r) => r.status === "read" && r.finished_at?.startsWith(String(year)))
    .sort((a, b) => b.finished_at!.localeCompare(a.finished_at!));

  const monthly = Array.from({ length: 12 }, () => 0);
  for (const r of finishedRows) monthly[Number(r.finished_at!.slice(5, 7)) - 1]++;

  const { activity: allActivity, pages, minutes } = dbStats as DbYearStats;
  const activity = Object.fromEntries(Object.entries(allActivity).filter(([d]) => d.startsWith(`${year}-`)));
  const yearDays = new Set(Object.keys(activity));
  const allDays = new Set(Object.keys(allActivity));
  const streaks = computeStreaks(allDays, today);
  const streak = {
    current: year === currentYear ? streaks.current : 0,
    longest: computeStreaks(yearDays, `${year}-12-31`).longest,
  };

  const formatCounts = new Map<ReadingFormat, number>();
  const topicCounts = new Map<string, { name: string; slug: string; count: number }>();
  for (const r of finishedRows) {
    const f = r.format ?? "paper";
    formatCounts.set(f, (formatCounts.get(f) ?? 0) + 1);
    for (const { topics } of r.books.book_topics) {
      const entry = topicCounts.get(topics.slug) ?? { ...topics, count: 0 };
      entry.count++;
      topicCounts.set(topics.slug, entry);
    }
  }

  const rated = finishedRows.filter((r) => r.rating != null);
  const goal = (profile?.yearly_goal as number | null) ?? null;
  const dayOfYear = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${year}-01-01T12:00:00Z`)) / 86_400_000) + 1;

  // Faoliyat boʻlgan yillar (yil tanlagich uchun)
  const yearsSet = new Set<number>([currentYear]);
  for (const r of rows) {
    if (r.finished_at) yearsSet.add(Number(r.finished_at.slice(0, 4)));
    if (r.started_at) yearsSet.add(Number(r.started_at.slice(0, 4)));
  }

  return {
    year,
    years: [...yearsSet].filter((y) => y <= currentYear).sort((a, b) => b - a),
    isCurrentYear: year === currentYear,
    goal,
    finished: finishedRows.map((r) => ({ ...r.books, finished_at: r.finished_at!, rating: r.rating })),
    expectedByToday: goal && year === currentYear ? (goal * dayOfYear) / (isLeapYear(year) ? 366 : 365) : null,
    monthly,
    pages,
    minutes,
    activity,
    activeDays: yearDays.size,
    streak,
    readingNow: rows.filter((r) => r.status === "reading").length,
    avgRating: rated.length ? rated.reduce((sum, r) => sum + Number(r.rating), 0) / rated.length : null,
    byFormat: (["paper", "ebook", "audio"] as const).map((format) => ({ format, count: formatCounts.get(format) ?? 0 })),
    byTopic: [...topicCounts.values()].sort((a, b) => b.count - a.count).slice(0, 8),
  };
}
