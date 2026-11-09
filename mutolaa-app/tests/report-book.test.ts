import { beforeEach, describe, expect, it, vi } from "vitest";

// "Xatoni bildirish" server action'i: kirish talabi, slug tekshiruvi va soatlik cheklov.
// Supabase va Telegram soxta (mock) — haqiqiy bazaga ham, chatga ham hech narsa ketmaydi.

const state = {
  user: null as { id: string; email: string | null } | null,
  book: null as { id: number; slug: string; title: string } | null,
  recentCount: 0,
  countError: null as { message: string } | null,
  insertError: null as { message: string } | null,
  inserted: [] as Record<string, unknown>[],
  sent: [] as { chatId: number; text: string }[],
};

vi.mock("@/lib/supabase/server", () => ({ getSessionUser: async () => state.user }));

vi.mock("@/lib/bot/telegram", () => ({
  appUrl: () => "https://sahifa.test",
  esc: (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  sendMessage: async (chatId: number, text: string) => {
    state.sent.push({ chatId, text });
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === "books") {
        return { select: () => ({ eq: (_c: string, slug: string) => ({ maybeSingle: async () => ({ data: state.book?.slug === slug ? state.book : null }) }) }) };
      }
      if (table === "book_reports") {
        return {
          select: () => ({ eq: () => ({ gte: async () => ({ count: state.recentCount, error: state.countError }) }) }),
          insert: async (row: Record<string, unknown>) => {
            if (!state.insertError) state.inserted.push(row);
            return { error: state.insertError };
          },
        };
      }
      throw new Error(`kutilmagan jadval: ${table}`);
    },
  }),
}));

const { reportBookIssue } = await import("@/app/actions/report-book");
const { uz } = await import("@/lib/i18n/uz");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("reportBookIssue", () => {
  beforeEach(() => {
    state.user = { id: "u-1", email: null };
    state.book = { id: 42, slug: "odisseya", title: "Odisseya" };
    state.recentCount = 0;
    state.countError = null;
    state.insertError = null;
    state.inserted = [];
    state.sent = [];
    vi.stubEnv("ALERT_TELEGRAM_CHAT_ID", "777");
  });

  it("tizimga kirmagan odamni rad etadi va hech narsa yubormaydi", async () => {
    state.user = null;
    const res = await reportBookIssue(null, form({ slug: "odisseya", message: "Betlar soni xato" }));
    expect(res).toEqual({ ok: false, error: uz.book.reportLogin });
    expect(state.sent).toHaveLength(0);
    expect(state.inserted).toHaveLength(0);
  });

  it("bazada yoʻq slug'ni rad etadi", async () => {
    const res = await reportBookIssue(null, form({ slug: "yoq-kitob", message: "Betlar soni xato" }));
    expect(res.ok).toBe(false);
    expect(state.sent).toHaveLength(0);
  });

  it("soatiga 5 tadan keyin cheklaydi", async () => {
    state.recentCount = 5;
    const res = await reportBookIssue(null, form({ slug: "odisseya", message: "Betlar soni xato" }));
    expect(res).toEqual({ ok: false, error: uz.book.reportLimit });
    expect(state.sent).toHaveLength(0);
    expect(state.inserted).toHaveLength(0);
  });

  it("jurnalga yozib boʻlmasa, xabar yuborilmaydi", async () => {
    state.insertError = { message: "relation does not exist" };
    const res = await reportBookIssue(null, form({ slug: "odisseya", message: "Betlar soni xato" }));
    expect(res.ok).toBe(false);
    expect(state.sent).toHaveLength(0);
  });

  it("hisoblab boʻlmasa ham rad etadi", async () => {
    state.countError = { message: "timeout" };
    const res = await reportBookIssue(null, form({ slug: "odisseya", message: "Betlar soni xato" }));
    expect(res.ok).toBe(false);
    expect(state.sent).toHaveLength(0);
  });

  it("muvaffaqiyatda jurnalga yozadi va nomni formadan emas, bazadan oladi", async () => {
    const res = await reportBookIssue(null, form({ slug: "odisseya", title: "<b>Soxta nom</b>", message: "Muqova <boshqa>" }));
    expect(res).toEqual({ ok: true, message: uz.book.reportSent });
    expect(state.inserted).toEqual([{ user_id: "u-1", book_id: 42, message: "Muqova <boshqa>" }]);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].chatId).toBe(777);
    expect(state.sent[0].text).toContain("<b>Odisseya</b>");
    expect(state.sent[0].text).not.toContain("Soxta nom");
    expect(state.sent[0].text).toContain("Muqova &lt;boshqa&gt;");
  });
});
