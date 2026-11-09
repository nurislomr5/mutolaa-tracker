import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineSnapshot } from "@/lib/offline";

// Oflayn javon: telefondagi navbat (IndexedDB — fake-indexeddb), fon sinxronlash, server tomonidagi amallar va API.
// Supabase va tarmoq soxta — haqiqiy bazaga hech narsa ketmaydi.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const server = {
  user: { id: "u-1", email: null } as { id: string; email: string | null } | null,
  owned: new Set([11]),
  notes: [] as { user_book_id: number; content: string }[],
  progress: [] as { userBookId: number; current: number; date?: string }[],
};

vi.mock("@/lib/supabase/server", () => ({
  getSessionUser: async () => server.user,
  createServerSupabase: async () => fakeDb(),
}));
vi.mock("@/lib/shelf-ops", () => ({
  applyProgress: async (_db: unknown, _userId: string, userBookId: number, input: { current: number; date?: string }) => {
    if (!server.owned.has(userBookId)) return null;
    server.progress.push({ userBookId, current: input.current, date: input.date });
    return { current: input.current };
  },
}));

function fakeDb() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => ((filters[k] = v), b),
        in: () => b,
        order: () => b,
        limit: async () =>
          table === "notes"
            ? { data: server.notes.filter((n) => n.user_book_id === filters.user_book_id && n.content === filters.content) }
            : { data: [], error: null },
        maybeSingle: async () => ({ data: table === "user_books" && server.owned.has(filters.id as number) ? { id: filters.id } : null }),
        insert: async (row: { user_book_id: number; content: string }) => (server.notes.push(row), { error: null }),
      };
      return b;
    },
  };
}

const snapshot = (current = 10): OfflineSnapshot => ({
  userId: "u-1",
  syncedAt: "2026-11-10T10:00:00.000Z",
  books: [
    {
      id: 11,
      bookId: 5,
      slug: "kitob",
      title: "Kitob",
      authors: null,
      cover: null,
      status: "reading",
      format: "paper",
      unit: "pages",
      current,
      total: 300,
      updatedAt: "2026-11-10T09:00:00.000Z",
    },
  ],
});

const store = await import("@/lib/offline-store");
const { applyOfflineOps } = await import("@/lib/offline");
const { _syncOnceForTests: syncOnce } = await import("@/components/offline/offline-sync");
const { GET, POST } = await import("@/app/api/offline/route");

const progressOp = (current: number, id = `p-${current}`) => ({
  id,
  kind: "progress" as const,
  userBookId: 11,
  format: "paper" as const,
  unit: "pages" as const,
  current,
  total: 300,
  date: "2026-11-09",
});

beforeEach(async () => {
  await store.clearOffline();
  server.user = { id: "u-1", email: null };
  server.notes = [];
  server.progress = [];
  vi.unstubAllGlobals();
  vi.stubGlobal("navigator", { onLine: true });
});

describe("telefondagi navbat", () => {
  it("progress darhol nusxada koʻrinadi va navbatga yoziladi", async () => {
    await store.saveSnapshot(snapshot(10));
    await store.addOp(progressOp(150));
    expect((await store.getSnapshot())?.books[0].current).toBe(150);
    expect(await store.listOps()).toHaveLength(1);
  });

  it("serverdan kelgan eski nusxa yuborilmagan progressni yoʻqotmaydi", async () => {
    await store.saveSnapshot(snapshot(10));
    await store.addOp(progressOp(150));
    await store.saveSnapshot(snapshot(10)); // fon yangilanishi (server hali eski qiymatda)
    expect((await store.getSnapshot())?.books[0].current).toBe(150);
  });
});

describe("fon sinxronlash", () => {
  it("navbatni yuboradi, yuborilganlarni oʻchiradi va yangi nusxani saqlaydi", async () => {
    await store.saveSnapshot(snapshot(10));
    await store.addOp(progressOp(150));
    vi.stubGlobal("fetch", async (_url: string, init?: { body?: string }) => {
      const ops = JSON.parse(init!.body!).ops as { id: string; createdAt?: string }[];
      expect(ops[0]).not.toHaveProperty("createdAt");
      return new Response(JSON.stringify({ results: ops.map((o) => ({ id: o.id, ok: true })), snapshot: snapshot(150) }));
    });
    expect(await syncOnce(true)).toBe("synced");
    expect(await store.listOps()).toHaveLength(0);
    expect((await store.getSnapshot())?.books[0].current).toBe(150);
  });

  it("tarmoq xatosida navbat telefonda qoladi", async () => {
    await store.addOp(progressOp(150));
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await syncOnce(true)).toBe("error");
    expect(await store.listOps()).toHaveLength(1);
  });

  it("internet yoʻq boʻlsa soʻrov yubormaydi", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await store.addOp(progressOp(150));
    expect(await syncOnce(true)).toBe("skipped");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("saytdan chiqilgan (401) boʻlsa telefondagi nusxa oʻchiriladi", async () => {
    await store.saveSnapshot(snapshot());
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
    expect(await syncOnce(false)).toBe("signed-out");
    expect(await store.getSnapshot()).toBeNull();
  });

  it("mehmon — hech narsa saqlanmagan boʻlsa soʻrov yubormaydi", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await syncOnce(false)).toBe("skipped");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("server: applyOfflineOps", () => {
  it("progressni sana bilan qoʻllaydi, begona kitobni rad etadi", async () => {
    const res = await applyOfflineOps(fakeDb() as never, "u-1", [progressOp(150), { ...progressOp(20, "x"), userBookId: 99 }]);
    expect(res).toEqual([
      { id: "p-150", ok: true },
      { id: "x", ok: false },
    ]);
    expect(server.progress).toEqual([{ userBookId: 11, current: 150, date: "2026-11-09" }]);
  });

  it("qaydni qoʻshadi; qayta yuborilsa takrorlamaydi; begona kitobga yozmaydi", async () => {
    const note = { id: "n1", kind: "note" as const, userBookId: 11, type: "iqtibos" as const, reference: "", content: "Ajoyib joy" };
    await applyOfflineOps(fakeDb() as never, "u-1", [note]);
    await applyOfflineOps(fakeDb() as never, "u-1", [{ ...note, id: "n1-qayta" }]);
    expect(server.notes).toHaveLength(1);
    const res = await applyOfflineOps(fakeDb() as never, "u-1", [{ ...note, id: "n2", userBookId: 99 }]);
    expect(res).toEqual([{ id: "n2", ok: false }]);
  });
});

describe("API /api/offline", () => {
  const req = (body: unknown, origin = "https://sahifa.test") =>
    Object.assign(new Request("https://sahifa.test/api/offline", { method: "POST", body: JSON.stringify(body), headers: { origin } }), {
      nextUrl: new URL("https://sahifa.test/api/offline"),
    }) as never;

  it("mehmonga 401", async () => {
    server.user = null;
    expect((await GET()).status).toBe(401);
    expect((await POST(req({ ops: [progressOp(1)] }))).status).toBe(401);
  });

  it("boshqa saytdan kelgan soʻrovni rad etadi (403)", async () => {
    expect((await POST(req({ ops: [progressOp(1)] }, "https://yomon.test"))).status).toBe(403);
    expect(server.progress).toHaveLength(0);
  });

  it("notoʻgʻri formatga 400", async () => {
    expect((await POST(req({ ops: [{ kind: "progress", userBookId: "x" }] }))).status).toBe(400);
    expect((await POST(req({ ops: [] }))).status).toBe(400);
  });
});
