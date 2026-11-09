import { describe, expect, it, vi } from "vitest";
import { todayInTashkent } from "@/lib/shelf-types";
import { addDays } from "@/lib/stats-utils";

// lib/stats.ts getYearStats: get_user_year_stats natijasidan faollik, streak va betlarni toʻgʻri yigʻadi.
// Supabase soxta — haqiqiy bazaga soʻrov yuborilmaydi.

const today = todayInTashkent();
const year = Number(today.slice(0, 4));
const yesterday = addDays(today, -1);
const lastYearDay = `${year - 1}-12-31`;

// Joriy yil: bugun + kecha oʻqilgan; oʻtgan yilning oxirgi kuni ham (streak uchun 400 kunlik oyna)
const rpcResult = {
  activity: { [today]: 2, [yesterday]: 1, [lastYearDay]: 1, [`${year}-01-01`]: 1 },
  pages: 120,
  minutes: 45,
};
const calls: unknown[] = [];

function chain(result: unknown) {
  const b = { select: () => b, eq: () => b, maybeSingle: async () => result, then: (r: (v: unknown) => void) => r(result) };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  getSessionUser: async () => ({ id: "u-1", email: null }),
  createServerSupabase: async () => ({
    from: (table: string) =>
      table === "profiles"
        ? chain({ data: { yearly_goal: 12 } })
        : chain({
            data: [
              {
                status: "read",
                format: "audio",
                started_at: `${year}-01-02`,
                finished_at: `${year}-02-10`,
                rating: 4,
                books: { id: 1, slug: "a", title: "A", book_topics: [{ topics: { name: "Roman", slug: "roman" } }] },
              },
              { status: "reading", format: "paper", started_at: `${year - 2}-05-01`, finished_at: null, rating: null, books: { id: 2, slug: "b", title: "B", book_topics: [] } },
            ],
            error: null,
          }),
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: rpcResult, error: null };
    },
  }),
}));

const { getYearStats } = await import("@/lib/stats");

describe("getYearStats", () => {
  it("bazadagi yigʻindidan foydalanadi va faqat shu yil kunlarini koʻrsatadi", async () => {
    const s = await getYearStats();
    expect(calls).toEqual([{ name: "get_user_year_stats", args: { p_year: year } }]);
    expect(s.pages).toBe(120);
    expect(s.minutes).toBe(45);
    expect(Object.keys(s.activity)).not.toContain(lastYearDay);
    expect(s.activity[today]).toBe(2);
    // 1-yanvar kecha bilan bir boʻlmasa ham hisoblanadi; yilning faol kunlari = shu yil kalitlari
    expect(s.activeDays).toBe(new Set([today, yesterday, `${year}-01-01`]).size);
    expect(s.streak.current).toBeGreaterThanOrEqual(2);
    expect(s.finished).toHaveLength(1);
    expect(s.monthly[1]).toBe(1);
    expect(s.byFormat.find((f) => f.format === "audio")?.count).toBe(1);
    expect(s.byTopic).toEqual([{ name: "Roman", slug: "roman", count: 1 }]);
    expect(s.readingNow).toBe(1);
    expect(s.years).toEqual(expect.arrayContaining([year, year - 2]));
  });
});
