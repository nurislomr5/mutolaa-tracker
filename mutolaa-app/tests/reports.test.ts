import { beforeEach, describe, expect, it, vi } from "vitest";

// Shikoyat yuborish (app/actions/reports.ts) va admin navbatidagi qarorlar (app/actions/admin-reports.ts).
// Supabase, Telegram va Next kesh funksiyalari soxta (mock) — haqiqiy bazaga ham, chatga ham hech narsa ketmaydi.

const ME = "11111111-1111-4111-8111-111111111111";
const AUTHOR = "22222222-2222-4222-8222-222222222222";

type Step = [method: string, ...args: unknown[]];
type Call = { client: "user" | "admin"; table: string; steps: Step[] };
type Result = { data?: unknown; error?: { message: string; code?: string } | null; count?: number };

const state = {
  user: null as { id: string; email: string | null } | null,
  isAdmin: false,
  calls: [] as Call[],
  respond: (() => ({ data: null, error: null })) as (call: Call) => Result,
  sent: [] as { chatId: number; text: string }[],
  tags: [] as string[],
  refreshed: 0,
};

// PostgREST soʻrov zanjirining soxtasi: har chaqiruv yozib boriladi, javobni state.respond beradi
function client(kind: Call["client"]) {
  return {
    from(table: string) {
      const call: Call = { client: kind, table, steps: [] };
      state.calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "insert", "update", "delete", "eq", "not", "is", "gte", "in", "order", "limit"]) {
        builder[method] = (...args: unknown[]) => {
          call.steps.push([method, ...args]);
          return builder;
        };
      }
      builder.maybeSingle = async () => state.respond(call);
      builder.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(state.respond(call)).then(resolve, reject);
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  getSessionUser: async () => state.user,
  createServerSupabase: async () => client("user"),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => client("admin") }));
vi.mock("@/lib/admin", () => ({ getAdminUser: async () => (state.isAdmin ? state.user : null) }));
vi.mock("next/cache", () => ({
  updateTag: (tag: string) => void state.tags.push(tag),
  refresh: () => void state.refreshed++,
}));
vi.mock("@/lib/bot/telegram", () => ({
  appUrl: () => "https://xatchop.test",
  esc: (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  sendMessage: async (chatId: number, text: string) => {
    state.sent.push({ chatId, text });
  },
}));

const { reportContent } = await import("@/app/actions/reports");
const { resolveBookReport, resolveContentReport } = await import("@/app/actions/admin-reports");
const { uz } = await import("@/lib/i18n/uz");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const op = (call: Call) => call.steps[0]?.[0];
const has = (call: Call, ...step: Step) => call.steps.some((s) => JSON.stringify(s) === JSON.stringify(step));
const find = (kind: Call["client"], table: string, first: string) => state.calls.filter((c) => c.client === kind && c.table === table && op(c) === first);

beforeEach(() => {
  state.user = { id: ME, email: null };
  state.isAdmin = false;
  state.calls = [];
  state.respond = () => ({ data: null, error: null });
  state.sent = [];
  state.tags = [];
  state.refreshed = 0;
  vi.stubEnv("ALERT_TELEGRAM_CHAT_ID", "777");
});

describe("reportContent", () => {
  // Odatiy holat: nishon shikoyatchiga koʻrinadi, muallifi boshqa odam
  const world = {
    visible: true,
    review: { user_id: AUTHOR, review: "Arzon <kitoblar> shu yerda", books: { title: "Odisseya" } } as Record<string, unknown> | null,
    post: { user_id: AUTHOR, body: "Klubdagi xabar", clubs: { name: "Kitob sevarlar" } } as Record<string, unknown> | null,
    profile: { id: AUTHOR, username: "ali", display_name: "Ali" } as Record<string, unknown> | null,
    recentCount: 0,
    countError: null as Result["error"],
    insertError: null as Result["error"],
  };
  const inserted = () => find("admin", "content_reports", "insert").map((c) => c.steps[0][1]);

  beforeEach(() => {
    Object.assign(world, { visible: true, recentCount: 0, countError: null, insertError: null });
    world.review = { user_id: AUTHOR, review: "Arzon <kitoblar> shu yerda", books: { title: "Odisseya" } };
    state.respond = (call) => {
      if (call.client === "user") {
        if (call.table === "profiles") return { data: world.profile };
        return { data: world.visible ? { id: 5 } : null };
      }
      if (call.table === "user_books") return { data: world.review };
      if (call.table === "club_posts") return { data: world.post };
      if (call.table === "content_reports" && op(call) === "select") return { count: world.recentCount, error: world.countError };
      if (call.table === "content_reports" && op(call) === "insert") return { error: world.insertError };
      throw new Error(`kutilmagan soʻrov: ${call.table}`);
    };
  });

  it("tizimga kirmagan odamni rad etadi va bazaga murojaat qilmaydi", async () => {
    state.user = null;
    const res = await reportContent(null, form({ type: "review", id: "5", reason: "spam" }));
    expect(res).toEqual({ ok: false, error: uz.report.login });
    expect(state.calls).toHaveLength(0);
  });

  it("notoʻgʻri tur, id yoki sabab rad etiladi", async () => {
    for (const fields of [
      { type: "book", id: "5", reason: "spam" },
      { type: "review", id: "abc", reason: "spam" },
      { type: "profile", id: "5", reason: "spam" },
      { type: "review", id: "5", reason: "yoqmadi" },
      { type: "review", id: "5", reason: "spam", message: "x".repeat(501) },
    ] as Record<string, string>[]) {
      expect(await reportContent(null, form(fields)), JSON.stringify(fields)).toEqual({ ok: false, error: uz.common.error });
    }
    expect(inserted()).toHaveLength(0);
  });

  it("shikoyatchiga koʻrinmaydigan yozuv (yopiq klub, yopiq profil) — 'topilmadi', matni oʻqilmaydi", async () => {
    world.visible = false;
    for (const type of ["review", "club_post"]) {
      expect(await reportContent(null, form({ type, id: "5", reason: "abuse" }))).toEqual({ ok: false, error: uz.report.notFound });
    }
    world.profile = null;
    expect(await reportContent(null, form({ type: "profile", id: AUTHOR, reason: "abuse" }))).toEqual({ ok: false, error: uz.report.notFound });
    world.profile = { id: AUTHOR, username: "ali", display_name: "Ali" };
    // koʻrinish foydalanuvchining oʻz sessiyasi bilan tekshirilgan, service role bilan hech narsa oʻqilmagan
    expect(state.calls.every((c) => c.client === "user")).toBe(true);
    expect(state.sent).toHaveLength(0);
  });

  it("oʻz yozuvi ustidan shikoyat qilib boʻlmaydi", async () => {
    world.review = { user_id: ME, review: "Mening taqrizim", books: { title: "Odisseya" } };
    expect(await reportContent(null, form({ type: "review", id: "5", reason: "spam" }))).toEqual({ ok: false, error: uz.report.own });
    expect(inserted()).toHaveLength(0);
  });

  it("soatiga 5 tadan keyin cheklaydi; hisoblab boʻlmasa ham rad etadi", async () => {
    world.recentCount = 5;
    expect(await reportContent(null, form({ type: "review", id: "5", reason: "spam" }))).toEqual({ ok: false, error: uz.report.limit });
    world.recentCount = 0;
    world.countError = { message: "timeout" };
    expect(await reportContent(null, form({ type: "review", id: "5", reason: "spam" }))).toEqual({ ok: false, error: uz.common.error });
    expect(inserted()).toHaveLength(0);
    expect(state.sent).toHaveLength(0);
  });

  it("navbatga yozib boʻlmasa, xabar yuborilmaydi", async () => {
    world.insertError = { message: "relation does not exist" };
    expect(await reportContent(null, form({ type: "review", id: "5", reason: "spam" }))).toEqual({ ok: false, error: uz.common.error });
    expect(state.sent).toHaveLength(0);
  });

  it("shu narsa ustidan ochiq shikoyati boʻlsa — qayta yozilmaydi va admin bezovta qilinmaydi", async () => {
    world.insertError = { message: "duplicate key", code: "23505" };
    expect(await reportContent(null, form({ type: "review", id: "5", reason: "spam" }))).toEqual({ ok: true, message: uz.report.already });
    expect(state.sent).toHaveLength(0);
  });

  it("taqriz: muallif va matn formadan emas, bazadan olinadi; adminga xabar ketadi", async () => {
    const res = await reportContent(null, form({ type: "review", id: "5", reason: "spam", message: " Reklama <b> ", target_user_id: ME, snapshot: "soxta" }));
    expect(res).toEqual({ ok: true, message: uz.report.sent });
    expect(inserted()).toEqual([
      { reporter_id: ME, target_type: "review", target_id: 5, target_user_id: AUTHOR, reason: "spam", message: "Reklama <b>", snapshot: "Arzon <kitoblar> shu yerda" },
    ]);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].chatId).toBe(777);
    expect(state.sent[0].text).toContain("Odisseya");
    expect(state.sent[0].text).toContain("Arzon &lt;kitoblar&gt; shu yerda");
    expect(state.sent[0].text).toContain("Reklama &lt;b&gt;");
    expect(state.sent[0].text).toContain("https://xatchop.test/admin/shikoyatlar");
  });

  it("klub xabari va profil: nishon toʻgʻri yoziladi (profilda id boʻsh)", async () => {
    await reportContent(null, form({ type: "club_post", id: "9", reason: "abuse" }));
    await reportContent(null, form({ type: "profile", id: AUTHOR, reason: "other" }));
    expect(inserted()).toEqual([
      { reporter_id: ME, target_type: "club_post", target_id: 9, target_user_id: AUTHOR, reason: "abuse", message: null, snapshot: "Klubdagi xabar" },
      { reporter_id: ME, target_type: "profile", target_id: null, target_user_id: AUTHOR, reason: "other", message: null, snapshot: "Ali @ali" },
    ]);
    // profil faqat ochiq boʻlsa topiladi
    expect(has(find("user", "profiles", "select")[0], "eq", "is_public", true)).toBe(true);
  });

  it("uzun matn: nusxa 4000 belgigacha, Telegram'ga 300 belgi", async () => {
    world.review = { user_id: AUTHOR, review: "a".repeat(5000), books: { title: "Odisseya" } };
    await reportContent(null, form({ type: "review", id: "5", reason: "spam" }));
    expect((inserted()[0] as { snapshot: string }).snapshot).toHaveLength(4000);
    expect(state.sent[0].text).toContain(`${"a".repeat(300)}…`);
    expect(state.sent[0].text).not.toContain("a".repeat(301));
  });
});

describe("resolveContentReport", () => {
  let report: Record<string, unknown> | null;
  const closing = () => find("admin", "content_reports", "update");

  beforeEach(() => {
    state.isAdmin = true;
    report = { id: 3, target_type: "review", target_id: 5, target_user_id: AUTHOR };
    state.respond = (call) => {
      if (call.table === "content_reports" && op(call) === "select") return { data: report };
      if (call.table === "user_books" && op(call) === "update") return { data: { book_id: 42 }, error: null };
      return { data: null, error: null };
    };
  });

  it("admin boʻlmagan odamni rad etadi va bazaga tegmaydi", async () => {
    state.isAdmin = false;
    expect(await resolveContentReport(3, "remove")).toEqual({ ok: false, error: uz.admin.forbidden });
    expect(await resolveBookReport(3)).toEqual({ ok: false, error: uz.admin.forbidden });
    expect(state.calls).toHaveLength(0);
  });

  it("notoʻgʻri id yoki allaqachon yopilgan shikoyat — xato, hech narsa oʻchmaydi", async () => {
    expect((await resolveContentReport(-1, "remove")).ok).toBe(false);
    expect(state.calls).toHaveLength(0);
    report = null;
    expect((await resolveContentReport(3, "remove")).ok).toBe(false);
    expect(state.calls.filter((c) => op(c) !== "select")).toHaveLength(0);
    // faqat ochiq shikoyat qidiriladi
    expect(has(state.calls[0], "eq", "status", "open")).toBe(true);
  });

  it("taqrizni oʻchirish: faqat matn va faqat oʻsha muallifniki; ovozlar, lenta yozuvi va kesh tozalanadi", async () => {
    expect(await resolveContentReport(3, "remove")).toEqual({ ok: true, message: uz.admin.removed });
    const [update] = find("admin", "user_books", "update");
    expect(update.steps[0]).toEqual(["update", { review: null, review_is_spoiler: false }]);
    expect(has(update, "eq", "id", 5) && has(update, "eq", "user_id", AUTHOR)).toBe(true);
    expect(has(find("admin", "review_votes", "delete")[0], "eq", "user_book_id", 5)).toBe(true);
    const [activity] = find("admin", "activities", "delete");
    expect(has(activity, "eq", "user_id", AUTHOR) && has(activity, "eq", "book_id", 42) && has(activity, "eq", "kind", "reviewed")).toBe(true);
    expect(state.tags).toEqual(["reviews:42"]);
    // shu taqriz ustidan tushgan hamma ochiq shikoyatlar birga yopiladi
    const [close] = closing();
    expect(close.steps[0]).toEqual(["update", { status: "removed", resolved_at: expect.any(String) }]);
    expect(has(close, "eq", "status", "open") && has(close, "eq", "target_type", "review") && has(close, "eq", "target_id", 5)).toBe(true);
    expect(state.refreshed).toBe(1);
  });

  it("rad etish: matnga tegilmaydi, shikoyat 'dismissed' boʻlib yopiladi", async () => {
    expect(await resolveContentReport(3, "dismiss")).toEqual({ ok: true, message: uz.admin.reportDismissed });
    expect(state.calls.filter((c) => c.table !== "content_reports")).toHaveLength(0);
    expect(closing()[0].steps[0]).toEqual(["update", { status: "dismissed", resolved_at: expect.any(String) }]);
    expect(state.tags).toEqual([]);
  });

  it("klub xabari oʻchiriladi — faqat oʻsha muallifniki", async () => {
    report = { id: 4, target_type: "club_post", target_id: 9, target_user_id: AUTHOR };
    expect((await resolveContentReport(4, "remove")).ok).toBe(true);
    const [del] = find("admin", "club_posts", "delete");
    expect(has(del, "eq", "id", 9) && has(del, "eq", "user_id", AUTHOR)).toBe(true);
    expect(find("admin", "user_books", "update")).toHaveLength(0);
  });

  it("profil yopiq qilinadi (oʻchirilmaydi); shikoyatlar target_id boʻsh boʻyicha yopiladi", async () => {
    report = { id: 6, target_type: "profile", target_id: null, target_user_id: AUTHOR };
    expect((await resolveContentReport(6, "remove")).ok).toBe(true);
    const [update] = find("admin", "profiles", "update");
    expect(update.steps[0]).toEqual(["update", { is_public: false }]);
    expect(has(update, "eq", "id", AUTHOR)).toBe(true);
    expect(state.calls.some((c) => op(c) === "delete")).toBe(false);
    const [close] = closing();
    expect(has(close, "is", "target_id", null) && has(close, "eq", "target_user_id", AUTHOR)).toBe(true);
  });

  it("oʻchirib boʻlmasa, shikoyat ochiq qoladi", async () => {
    state.respond = (call) => {
      if (call.table === "content_reports" && op(call) === "select") return { data: report };
      if (call.table === "user_books") return { data: null, error: { message: "timeout" } };
      return { data: null, error: null };
    };
    expect(await resolveContentReport(3, "remove")).toEqual({ ok: false, error: uz.common.error });
    expect(closing()).toHaveLength(0);
    expect(state.refreshed).toBe(0);
  });

  it("resolveBookReport: faqat hali ochiq xabarni 'hal qilindi' deb belgilaydi", async () => {
    expect(await resolveBookReport(8)).toEqual({ ok: true, message: uz.admin.resolved });
    const [update] = find("admin", "book_reports", "update");
    expect(update.steps[0]).toEqual(["update", { resolved_at: expect.any(String) }]);
    expect(has(update, "eq", "id", 8) && has(update, "is", "resolved_at", null)).toBe(true);
    expect(state.refreshed).toBe(1);
  });
});
