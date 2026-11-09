import { beforeEach, describe, expect, it, vi } from "vitest";

// app/actions/admin-books.ts: faqat admin, toʻgʻri parametrlar, kesh yangilanishi; lib/admin-books.ts: asosiy nusxa tavsiyasi.
// Supabase soxta — haqiqiy bazaga hech narsa ketmaydi.

const state = {
  user: { id: "u-admin", email: null } as { id: string; email: string | null } | null,
  isAdmin: true,
  rpcCalls: [] as { name: string; args: unknown }[],
  rpcError: null as { message: string } | null,
  upserts: [] as unknown[],
  tags: [] as string[],
};

vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: (t: string) => void state.tags.push(t) }));
vi.mock("@/lib/supabase/server", () => ({ getSessionUser: async () => state.user }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: table === "profiles" ? { is_admin: state.isAdmin } : null }),
        upsert: async (row: unknown) => {
          state.upserts.push(row);
          return { error: null };
        },
      };
      return b;
    },
    rpc: async (name: string, args: unknown) => {
      state.rpcCalls.push({ name, args });
      if (state.rpcError) return { data: null, error: state.rpcError };
      return { data: { target_slug: "asosiy", source_slug: "takror", moved_users: 2, merged_users: 1 }, error: null };
    },
  }),
}));

const { mergeBooks, dismissDuplicate } = await import("@/app/actions/admin-books");
const { suggestTarget } = await import("@/lib/admin-books");
const { uz } = await import("@/lib/i18n/uz");

beforeEach(() => {
  state.user = { id: "u-admin", email: null };
  state.isAdmin = true;
  state.rpcCalls = [];
  state.rpcError = null;
  state.upserts = [];
  state.tags = [];
});

describe("mergeBooks", () => {
  it("admin boʻlmasa bazaga tegmaydi", async () => {
    state.isAdmin = false;
    expect(await mergeBooks(1, 2)).toEqual({ ok: false, error: uz.admin.forbidden });
    state.user = null;
    expect(await mergeBooks(1, 2)).toEqual({ ok: false, error: uz.admin.forbidden });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("bir xil yoki notoʻgʻri id'ni rad etadi", async () => {
    expect((await mergeBooks(5, 5)).ok).toBe(false);
    expect((await mergeBooks(-1, 5)).ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("merge_books ni chaqiradi va ikkala kitobning keshini yangilaydi", async () => {
    const res = await mergeBooks(10, 20);
    expect(res).toEqual({ ok: true, message: uz.admin.merged(3) });
    expect(state.rpcCalls).toEqual([{ name: "merge_books", args: { p_target: 10, p_source: 20 } }]);
    expect(state.tags).toEqual(expect.arrayContaining(["catalog", "book:asosiy", "book:takror", "reviews:10", "reviews:20"]));
  });

  it("Mutolaa qoidasi xatosini tushunarli qiladi", async () => {
    state.rpcError = { message: "merge_books: Mutolaa kitobi asosiy boʻlishi kerak" };
    expect(await mergeBooks(10, 20)).toEqual({ ok: false, error: uz.admin.mutolaaTarget });
  });
});

describe("dismissDuplicate", () => {
  it("juftlikni kichik id birinchi tartibda saqlaydi", async () => {
    expect((await dismissDuplicate(30, 7)).ok).toBe(true);
    expect(state.upserts).toEqual([{ book_a: 7, book_b: 30 }]);
  });

  it("admin boʻlmasa saqlamaydi", async () => {
    state.isAdmin = false;
    expect((await dismissDuplicate(1, 2)).ok).toBe(false);
    expect(state.upserts).toHaveLength(0);
  });
});

describe("suggestTarget", () => {
  const book = (id: number, source: "mutolaa" | "asaxiy" | "hilol" | "user", readers = 0, sources: string[] = []) => ({
    id,
    slug: `k${id}`,
    title: "K",
    author_names: null,
    cover_url: null,
    isbn: null,
    page_count: null,
    published_year: null,
    source,
    formats: [],
    publisher: null,
    sources,
    readers,
  });

  it("Mutolaa, soʻng oʻquvchilar, soʻng nashrlar, soʻng eski kitob", () => {
    expect(suggestTarget(book(9, "asaxiy", 5), book(3, "mutolaa"))).toBe(3);
    expect(suggestTarget(book(1, "hilol", 0), book(2, "asaxiy", 2))).toBe(2);
    expect(suggestTarget(book(1, "hilol", 1, ["hilol"]), book(2, "asaxiy", 1, ["asaxiy", "hilol"]))).toBe(2);
    expect(suggestTarget(book(8, "asaxiy"), book(4, "hilol"))).toBe(4);
  });
});
