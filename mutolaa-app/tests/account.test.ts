import { beforeEach, describe, expect, it, vi } from "vitest";

// "Hisobni oʻchirish" server action'i: faqat kirgan foydalanuvchining oʻzi, faqat tasdiq bilan.
// Supabase soxta (mock) — haqiqiy bazaga hech narsa ketmaydi. Bazadagi zanjirli oʻchirish — tests/db-access.test.ts da.

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const state = {
  user: null as { id: string; email: string | null } | null,
  deleteError: null as { message: string } | null,
  deleted: [] as string[],
  signedOut: 0,
  signOutThrows: false,
  cookies: [] as string[],
  alerts: [] as string[],
};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => state.cookies.map((name) => ({ name, value: "x" })),
    delete: (name: string) => {
      state.cookies = state.cookies.filter((c) => c !== name);
    },
  }),
}));
vi.mock("@/lib/alert", () => ({
  sendAlert: async (key: string) => {
    state.alerts.push(key);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  getSessionUser: async () => state.user,
  createServerSupabase: async () => ({
    auth: {
      signOut: async () => {
        if (state.signOutThrows) throw new Error("tarmoq xatosi");
        state.signedOut++;
        return { error: null };
      },
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          if (!state.deleteError) state.deleted.push(id);
          return { error: state.deleteError };
        },
      },
    },
  }),
}));

const { deleteAccount } = await import("@/app/actions/account");
const { uz } = await import("@/lib/i18n/uz");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  state.user = { id: USER, email: "a@x.test" };
  state.deleteError = null;
  state.deleted = [];
  state.signedOut = 0;
  state.signOutThrows = false;
  state.cookies = ["sb-abc-auth-token", "sb-abc-auth-token.1", "theme"];
  state.alerts = [];
});

describe("deleteAccount", () => {
  it("mehmon — hech narsa oʻchirilmaydi", async () => {
    state.user = null;
    expect(await deleteAccount(form({ confirm: "on" }))).toEqual({ ok: false, error: uz.common.error });
    expect(state.deleted).toEqual([]);
  });

  it("tasdiq belgisi qoʻyilmagan — hech narsa oʻchirilmaydi", async () => {
    expect(await deleteAccount(form({}))).toEqual({ ok: false, error: uz.account.confirmRequired });
    expect(await deleteAccount(form({ confirm: "yes" }))).toEqual({ ok: false, error: uz.account.confirmRequired });
    expect(state.deleted).toEqual([]);
    expect(state.signedOut).toBe(0);
  });

  it("faqat sessiyadagi foydalanuvchini oʻchiradi (formadagi id eʼtiborga olinmaydi) va sessiyani tozalaydi", async () => {
    const result = await deleteAccount(form({ confirm: "on", id: OTHER, user_id: OTHER }));
    expect(result).toEqual({ ok: true });
    expect(state.deleted).toEqual([USER]);
    expect(state.signedOut).toBe(1);
    expect(state.cookies).toEqual(["theme"]); // sb-* cookie'lar oʻchdi, boshqalariga tegilmadi
  });

  it("chiqish soʻrovi yiqilsa ham cookie'lar oʻchadi", async () => {
    state.signOutThrows = true;
    expect(await deleteAccount(form({ confirm: "on" }))).toEqual({ ok: true });
    expect(state.cookies).toEqual(["theme"]);
  });

  it("baza xato bersa — xabar qaytadi, sessiya joyida qoladi, egaga ogohlantirish ketadi", async () => {
    state.deleteError = { message: "Database error deleting user" };
    expect(await deleteAccount(form({ confirm: "on" }))).toEqual({ ok: false, error: uz.account.deleteFailed });
    expect(state.signedOut).toBe(0);
    expect(state.cookies).toHaveLength(3);
    expect(state.alerts).toEqual(["delete-account"]);
  });
});
