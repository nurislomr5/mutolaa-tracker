import { beforeEach, describe, expect, it, vi } from "vitest";

// app/actions/social.ts setHelpful: kirish talabi, ovoz berish/qaytarish, kitob sharhlari keshini yangilash.
// Supabase soxta — ruxsatlar (RLS) tests/db-access.test.ts da haqiqiy SQL bilan tekshiriladi.

const state = {
  user: { id: "u-1", email: null } as { id: string; email: string | null } | null,
  calls: [] as string[],
  error: null as { message: string } | null,
  tags: [] as string[],
};

vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: (t: string) => void state.tags.push(t) }));
vi.mock("@/lib/supabase/server", () => ({
  getSessionUser: async () => state.user,
  createServerSupabase: async () => ({
    from: (table: string) => {
      const b = {
        upsert: async (row: object, opts: object) => (state.calls.push(`${table}.upsert ${JSON.stringify(row)} ${JSON.stringify(opts)}`), { error: state.error }),
        delete: () => (state.calls.push(`${table}.delete`), b),
        select: () => b,
        eq: (k: string, v: unknown) => (state.calls.push(`${table}.eq ${k}=${v}`), b),
        maybeSingle: async () => ({ data: { book_id: 77 } }),
        then: (r: (v: unknown) => void) => r({ error: state.error }),
      };
      return b;
    },
  }),
}));

const { setHelpful } = await import("@/app/actions/social");

beforeEach(() => {
  state.user = { id: "u-1", email: null };
  state.calls = [];
  state.error = null;
  state.tags = [];
});

describe("setHelpful", () => {
  it("mehmon yoki notoʻgʻri id — bazaga tegmaydi", async () => {
    state.user = null;
    expect(await setHelpful(5, true)).toEqual({ ok: false });
    state.user = { id: "u-1", email: null };
    expect(await setHelpful(-5, true)).toEqual({ ok: false });
    expect(state.calls).toHaveLength(0);
  });

  it("ovoz beradi (takror bosish xato bermaydi) va kitob sharhlari keshini yangilaydi", async () => {
    expect(await setHelpful(5, true)).toEqual({ ok: true });
    expect(state.calls[0]).toBe(`review_votes.upsert {"user_book_id":5} {"onConflict":"user_id,user_book_id","ignoreDuplicates":true}`);
    expect(state.tags).toEqual(["reviews:77"]);
  });

  it("ovozni faqat oʻz nomidan qaytaradi", async () => {
    expect(await setHelpful(5, false)).toEqual({ ok: true });
    expect(state.calls).toEqual(expect.arrayContaining(["review_votes.delete", "review_votes.eq user_id=u-1", "review_votes.eq user_book_id=5"]));
  });

  it("baza rad etsa (masalan, oʻz taqriziga) — xato qaytaradi, keshga tegmaydi", async () => {
    state.error = { message: "new row violates row-level security policy" };
    expect(await setHelpful(5, true)).toEqual({ ok: false });
    expect(state.tags).toHaveLength(0);
  });
});
