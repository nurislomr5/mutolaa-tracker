import { beforeEach, describe, expect, it, vi } from "vitest";

// app/actions/clubs.ts: validatsiya, xato xabarlari, yoʻnaltirish; lib/clubs.ts: aʼzo progressi matni.
// Ruxsatlarning oʻzi (RLS va funksiyalar) — tests/db-access.test.ts da haqiqiy SQL bilan.

const state = {
  user: { id: "11111111-1111-4111-8111-111111111111", email: null } as { id: string; email: string | null } | null,
  rpc: [] as { name: string; args: unknown }[],
  rpcResult: { data: "kitob-sevarlar" as unknown, error: null as { message: string } | null },
  writeResult: { data: [{ id: 1 }] as unknown[] | null, error: null as { message: string } | null },
  redirects: [] as string[],
};

vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    state.redirects.push(url);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  getSessionUser: async () => state.user,
  createServerSupabase: async () => ({
    rpc: async (name: string, args: unknown) => (state.rpc.push({ name, args }), state.rpcResult),
    from: () => {
      const b = {
        insert: () => b,
        update: () => b,
        delete: () => b,
        upsert: () => b,
        eq: () => b,
        select: async () => state.writeResult,
        then: (r: (v: unknown) => void) => r(state.writeResult),
      };
      return b;
    },
  }),
}));

const actions = await import("@/app/actions/clubs");
const { memberProgress } = await import("@/lib/clubs");
const { uz } = await import("@/lib/i18n/uz");

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  state.user = { id: "11111111-1111-4111-8111-111111111111", email: null };
  state.rpc = [];
  state.rpcResult = { data: "kitob-sevarlar", error: null };
  state.writeResult = { data: [{ id: 1 }], error: null };
  state.redirects = [];
});

describe("createClub", () => {
  it("mehmon va qisqa nom — bazaga tegmaydi", async () => {
    state.user = null;
    expect(await actions.createClub(null, form({ name: "Kitob klubi" }))).toEqual({ ok: false, error: uz.clubs.signInFirst });
    state.user = { id: "u", email: null };
    expect(await actions.createClub(null, form({ name: "Ab" }))).toEqual({ ok: false, error: uz.clubs.nameShort });
    expect(state.rpc).toHaveLength(0);
  });

  it("ochadi va klub sahifasiga yoʻnaltiradi", async () => {
    await expect(actions.createClub(null, form({ name: "Kitob sevarlar", description: "", is_public: "0" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(state.rpc).toEqual([{ name: "create_club", args: { p_name: "Kitob sevarlar", p_description: "", p_is_public: false } }]);
    expect(state.redirects).toEqual(["/klub/kitob-sevarlar"]);
  });

  it("kunlik cheklov xabarini tushunarli qiladi", async () => {
    state.rpcResult = { data: null, error: { message: "create_club: kunlik cheklov" } };
    expect(await actions.createClub(null, form({ name: "Kitob sevarlar" }))).toEqual({ ok: false, error: uz.clubs.dailyLimit });
  });
});

describe("taklif va aʼzolik", () => {
  it("notoʻgʻri kod — bazaga soʻrov yuborilmaydi", async () => {
    expect(await actions.joinClubByCode("abc")).toEqual({ ok: false, error: uz.clubs.inviteInvalid });
    expect(state.rpc).toHaveLength(0);
  });

  it("eskirgan kod (baza null qaytaradi) — xabar", async () => {
    state.rpcResult = { data: null, error: null };
    expect(await actions.joinClubByCode("0123456789abcdef0123456789abcdef")).toEqual({ ok: false, error: uz.clubs.inviteInvalid });
  });

  it("boshqaruvchi chiqa olmaydi (baza hech narsa oʻchirmaydi)", async () => {
    state.writeResult = { data: [], error: null };
    expect(await actions.leaveClub(5)).toEqual({ ok: false, error: uz.clubs.ownerCannotLeave });
  });
});

describe("muhokama", () => {
  it("boʻsh xabar, aʼzo emas va soatlik cheklov — tushunarli xato", async () => {
    expect(await actions.addClubPost(null, form({ clubId: "5", body: "   " }))).toEqual({ ok: false, error: uz.clubs.postEmpty });
    state.writeResult = { data: null, error: { message: "new row violates row-level security policy" } };
    expect(await actions.addClubPost(null, form({ clubId: "5", body: "Salom" }))).toEqual({ ok: false, error: uz.clubs.postNotMember });
    state.writeResult = { data: null, error: { message: "club_posts: juda koʻp xabar" } };
    expect(await actions.addClubPost(null, form({ clubId: "5", body: "Salom" }))).toEqual({ ok: false, error: uz.clubs.postLimit });
  });
});

describe("memberProgress", () => {
  const m = (over: object) => ({ user_id: "u", display_name: "A", username: null, avatar_url: null, role: "member" as const, joined_at: "", status: null, unit: null, current_value: null, total_value: null, rating: null, ...over });

  it("betlar, foiz, oʻqib boʻlgan va boshlamagan", () => {
    expect(memberProgress(m({ status: "reading", unit: "pages", current_value: 120, total_value: 400 }))).toEqual({ label: "120 / 400 bet", pct: 30 });
    expect(memberProgress(m({ status: "reading", unit: "percent", current_value: 45 }))).toEqual({ label: "45%", pct: 45 });
    expect(memberProgress(m({ status: "read", rating: 4.5 }))).toEqual({ label: "★ 4.5", pct: 100 });
    expect(memberProgress(m({}))).toEqual({ label: null, pct: null });
  });
});
