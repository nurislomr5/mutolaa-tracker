import { uz } from "@/lib/i18n/uz";
import type { ShareCard } from "@/lib/share-image";
import type { ReadingFormat } from "@/lib/shelf-types";
import type { YearStats } from "@/lib/stats";

// Yil sarhisobi: yillik statistikadan "hikoya" uchun eng qiziq faktlarni ajratib oladi. Sof funksiya — bazaga murojaat yoʻq.

export type WrapUpBook = {
  slug: string;
  title: string;
  author_names: string | null;
  cover_url: string | null;
  finished_at: string;
  rating: number | null;
};

export const PERSONAS = ["starter", "listener", "disciplined", "bookworm", "explorer", "loyal", "steady", "reader"] as const;
export type Persona = (typeof PERSONAS)[number];

export type WrapUp = {
  year: number;
  isCurrentYear: boolean;
  books: number;
  goal: number | null;
  goalReached: boolean;
  pages: number;
  minutes: number;
  activeDays: number;
  longestStreak: number;
  monthly: number[];
  bestMonth: { index: number; count: number } | null;
  topAuthor: { name: string; count: number } | null;
  topTopic: { name: string; slug: string; count: number } | null;
  topFormat: { format: ReadingFormat; count: number; share: number } | null;
  favorites: WrapUpBook[];
  first: WrapUpBook | null;
  last: WrapUpBook | null;
  avgRating: number | null;
  covers: string[];
  persona: Persona;
  hasData: boolean;
};

export type WrapUpInput = Pick<
  YearStats,
  "year" | "isCurrentYear" | "goal" | "finished" | "monthly" | "pages" | "minutes" | "activeDays" | "streak" | "avgRating" | "byFormat" | "byTopic"
>;

const MAX_FAVORITES = 3;
const MAX_COVERS = 6;
// Bitta kitob bilan "sevimli muallif" deyish kulgili — kamida ikkita kitob kerak
const MIN_AUTHOR_BOOKS = 2;

function pick(b: WrapUpInput["finished"][number]): WrapUpBook {
  return { slug: b.slug, title: b.title, author_names: b.author_names, cover_url: b.cover_url, finished_at: b.finished_at, rating: b.rating };
}

function topAuthor(books: WrapUpBook[]) {
  // eng koʻp oʻqilgan; teng boʻlsa — yil davomida birinchi uchragan muallif
  const counts = new Map<string, number>();
  for (const b of books) {
    const names = new Set((b.author_names ?? "").split(",").map((a) => a.trim()).filter(Boolean));
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best: { name: string; count: number } | null = null;
  for (const [name, count] of counts) if (!best || count > best.count) best = { name, count };
  return best && best.count >= MIN_AUTHOR_BOOKS ? best : null;
}

function persona(w: Pick<WrapUp, "books" | "longestStreak" | "topFormat" | "topAuthor">, topics: number): Persona {
  if (w.books === 0) return "starter";
  if (w.topFormat?.format === "audio" && w.topFormat.share >= 0.5 && w.books >= 3) return "listener";
  if (w.longestStreak >= 30) return "disciplined";
  if (w.books >= 24) return "bookworm";
  if (topics >= 5) return "explorer";
  if (w.topAuthor && w.topAuthor.count >= 3) return "loyal";
  if (w.books >= 12) return "steady";
  return "reader";
}

export function buildWrapUp(stats: WrapUpInput): WrapUp {
  // stats.finished — yangidan eskiga; hikoya uchun yil boshidan oxiriga qarab ketamiz
  const chrono = stats.finished.map(pick).sort((a, b) => a.finished_at.localeCompare(b.finished_at));
  const books = chrono.length;

  const maxMonth = Math.max(0, ...stats.monthly);
  const bestMonth = maxMonth > 0 ? { index: stats.monthly.indexOf(maxMonth), count: maxMonth } : null;

  const format = [...stats.byFormat].sort((a, b) => b.count - a.count)[0];
  const topFormat = format && format.count > 0 && books > 0 ? { format: format.format, count: format.count, share: format.count / books } : null;

  // sevimlilar: eng yuqori baholanganlar (kamida 4 yulduz), teng boʻlsa — keyinroq oʻqilgani
  const favorites = chrono
    .filter((b) => b.rating != null && b.rating >= 4)
    .sort((a, b) => b.rating! - a.rating! || b.finished_at.localeCompare(a.finished_at))
    .slice(0, MAX_FAVORITES);

  // rasm va sahifa uchun muqovalar: avval sevimlilar, keyin oxirgi oʻqilganlar
  const covers: string[] = [];
  for (const b of [...favorites, ...[...chrono].reverse()]) {
    if (b.cover_url && !covers.includes(b.cover_url)) covers.push(b.cover_url);
    if (covers.length >= MAX_COVERS) break;
  }

  const base = {
    books,
    longestStreak: stats.streak.longest,
    topFormat,
    topAuthor: topAuthor(chrono),
  };

  return {
    ...base,
    year: stats.year,
    isCurrentYear: stats.isCurrentYear,
    goal: stats.goal,
    goalReached: !!stats.goal && books >= stats.goal,
    pages: stats.pages,
    minutes: stats.minutes,
    activeDays: stats.activeDays,
    monthly: stats.monthly,
    bestMonth,
    topTopic: stats.byTopic[0] ?? null,
    favorites,
    first: chrono[0] ?? null,
    last: books > 1 ? chrono[books - 1] : null,
    avgRating: stats.avgRating,
    covers,
    persona: persona(base, stats.byTopic.length),
    hasData: books > 0 || stats.activeDays > 0,
  };
}

// Ulashiladigan "yil sarhisobi" rasmi uchun maʼlumot (statistika va sarhisob sahifalari bir xil rasm beradi)
export function yearShareCard(w: WrapUp, reader?: string | null): ShareCard {
  return {
    kind: "year",
    year: w.year,
    books: w.books,
    goal: w.goal,
    pages: w.pages,
    minutes: w.minutes,
    longestStreak: w.longestStreak,
    activeDays: w.activeDays,
    topAuthor: w.topAuthor?.name,
    topTopic: w.topTopic?.name,
    persona: w.books > 0 ? uz.wrapup.personas[w.persona].label : null,
    covers: w.covers,
    reader,
  };
}
