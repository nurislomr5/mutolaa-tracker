import { beforeEach, describe, expect, it, vi } from "vitest";
import { canEditBook, keepEdited, sameAuthors } from "@/lib/book-edit";

// Kitobni tahrirlash: kim tahrirlay oladi (egasi yoki admin), mualliflar qachon qayta bogʻlanadi,
// import tahrirlangan maydonlarni saqlashi. Supabase soxta — haqiqiy bazaga hech narsa ketmaydi.

const state = {
  user: { id: "u-1", email: null } as { id: string; email: string | null } | null,
  isAdmin: false,
  book: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
  linked: [] as { authors: string[]; replace: boolean }[],
  tags: [] as string[],
};

vi.mock("next/cache", () => ({ updateTag: (t: string) => void state.tags.push(t) }));
vi.mock("@/lib/supabase/server", () => ({ getSessionUser: async () => state.user }));
vi.mock("@/lib/admin", () => ({ getAdminUser: async () => (state.isAdmin ? state.user : null) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.book }) }) }),
      update: (payload: Record<string, unknown>) => ({
        eq: async () => {
          state.updates.push(payload);
          return { error: null };
        },
      }),
    }),
  }),
}));
vi.mock("@/lib/book-write", () => ({
  bookColumns: (input: { title: string; cover_url?: string }, authors: string[]) => ({
    title: input.title,
    author_names: authors.join(", "),
    cover_url: input.cover_url || null,
  }),
  linkAuthors: async (_db: unknown, _id: number, authors: string[], replace: boolean) => void state.linked.push({ authors, replace }),
  removeCover: async () => {},
  resolvePublisher: async () => ({ publisher_id: null, publisher: null }),
  uploadCover: async () => null,
}));

const { editBook } = await import("@/app/actions/edit-book");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ slug: "otkan-kunlar", title: "Oʻtkan kunlar", authors: "Abdulla Qodiriy", ...fields })) fd.set(k, v);
  fd.append("formats", "paper");
  return fd;
}

beforeEach(() => {
  state.user = { id: "u-1", email: null };
  state.isAdmin = false;
  state.book = { id: 7, source: "mutolaa", created_by: null, cover_url: null, author_names: "Abdulla Qodiriy" };
  state.updates = [];
  state.linked = [];
  state.tags = [];
});

describe("canEditBook", () => {
  const own = { source: "user", created_by: "u-1" };
  const imported = { source: "mutolaa", created_by: null };

  it("mehmon hech narsani tahrirlay olmaydi", () => {
    expect(canEditBook(own, null, false)).toBe(false);
    expect(canEditBook(imported, undefined, true)).toBe(false);
  });

  it("foydalanuvchi faqat oʻzi qoʻshgan kitobni tahrirlaydi", () => {
    expect(canEditBook(own, "u-1", false)).toBe(true);
    expect(canEditBook(own, "u-2", false)).toBe(false);
    expect(canEditBook(imported, "u-1", false)).toBe(false);
    // created_by tasodifan mos kelsa ham import qilingan kitob ochilmaydi
    expect(canEditBook({ source: "asaxiy", created_by: "u-1" }, "u-1", false)).toBe(false);
  });

  it("admin har qanday kitobni tahrirlaydi", () => {
    expect(canEditBook(imported, "u-9", true)).toBe(true);
    expect(canEditBook(own, "u-9", true)).toBe(true);
    expect(canEditBook({ source: "hilol", created_by: null }, "u-9", true)).toBe(true);
  });
});

describe("sameAuthors", () => {
  it("bir xil roʻyxatni tanidi (boʻshliqlarga qaramay)", () => {
    expect(sameAuthors("Abdulla Qodiriy, Choʻlpon", ["Abdulla Qodiriy", "Choʻlpon"])).toBe(true);
    expect(sameAuthors("Abdulla Qodiriy,Choʻlpon ", ["Abdulla Qodiriy", "Choʻlpon"])).toBe(true);
  });

  it("oʻzgarish, tartib va boʻsh qiymatni farqlaydi", () => {
    expect(sameAuthors("Abdulla Qodiriy", ["Abdulla Qodiriy", "Choʻlpon"])).toBe(false);
    expect(sameAuthors("Choʻlpon, Abdulla Qodiriy", ["Abdulla Qodiriy", "Choʻlpon"])).toBe(false);
    expect(sameAuthors(null, ["Abdulla Qodiriy"])).toBe(false);
    expect(sameAuthors(null, [])).toBe(true);
  });
});

describe("keepEdited (import tahrirlangan kitobni qayta yozmaydi)", () => {
  const incoming = { slug: "s", title: "Manbadagi nom", author_names: "Manba", description: "eski", cover_url: "https://a/b.jpg", publisher: "N", mutolaa_rating: 4.5 };

  it("tahrirlanmagan yoki yangi kitob — manbadagi maʼlumot oʻtadi", () => {
    expect(keepEdited(incoming, undefined)).toEqual(incoming);
    expect(keepEdited(incoming, { slug: "s", title: "Boshqa", edited_at: null })).toEqual(incoming);
  });

  it("tahrirlangan kitob — tuzatilgan maydonlar saqlanadi, qolganlari yangilanadi", () => {
    const existing = { slug: "s", edited_at: "2026-11-10T00:00:00Z", title: "Toʻgʻri nom", author_names: "Toʻgʻri muallif", description: null, cover_url: null, publisher: null };
    expect(keepEdited(incoming, existing)).toEqual({
      slug: "s",
      title: "Toʻgʻri nom",
      author_names: "Toʻgʻri muallif",
      description: null,
      cover_url: null,
      publisher: null,
      mutolaa_rating: 4.5,
    });
  });

  it("kalitlar toʻplami oʻzgarmaydi (ommaviy upsert uchun barcha qatorlar bir xil boʻlishi kerak)", () => {
    const existing = { edited_at: "2026-11-10T00:00:00Z", title: "T" };
    expect(Object.keys(keepEdited(incoming, existing))).toEqual(Object.keys(incoming));
    expect(keepEdited(incoming, existing).description).toBe("eski");
  });
});

describe("editBook (server action)", () => {
  it("mehmon va begona foydalanuvchi rad etiladi", async () => {
    state.user = null;
    expect((await editBook(null, form({})))?.ok).toBe(false);
    state.user = { id: "u-1", email: null };
    expect((await editBook(null, form({})))?.ok).toBe(false);
    state.book = { id: 7, source: "user", created_by: "u-2", cover_url: null, author_names: "Abdulla Qodiriy" };
    expect((await editBook(null, form({})))?.ok).toBe(false);
    expect(state.updates).toEqual([]);
  });

  it("kitob egasi oʻz kitobini tahrirlaydi", async () => {
    state.book = { id: 7, source: "user", created_by: "u-1", cover_url: null, author_names: "Abdulla Qodiriy" };
    const res = await editBook(null, form({ title: "Yangi nom" }));
    expect(res).toEqual({ ok: true, redirectTo: "/kitob/otkan-kunlar" });
    expect(state.updates[0]).toMatchObject({ title: "Yangi nom" });
    expect(state.tags).toEqual(["catalog", "book:otkan-kunlar"]);
  });

  it("admin import qilingan kitobni tahrirlaydi va u qoʻlda tahrirlangan deb belgilanadi", async () => {
    state.isAdmin = true;
    const res = await editBook(null, form({ title: "Oʻtkan kunlar (toʻliq)" }));
    expect(res?.ok).toBe(true);
    expect(state.updates[0]).toMatchObject({ title: "Oʻtkan kunlar (toʻliq)" });
    expect(Object.keys(state.updates[1])).toEqual(["edited_at"]);
    // mualliflar oʻzgarmadi — manbadagi muallif bogʻlanishlariga tegilmaydi
    expect(state.linked).toEqual([]);
  });

  it("mualliflar oʻzgarsa — qayta bogʻlanadi", async () => {
    state.isAdmin = true;
    await editBook(null, form({ authors: "Abdulla Qodiriy, Choʻlpon" }));
    expect(state.linked).toEqual([{ authors: ["Abdulla Qodiriy", "Choʻlpon"], replace: true }]);
  });
});
