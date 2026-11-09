import { beforeEach, describe, expect, it, vi } from "vitest";

// app/actions/shelf.ts: begona user_book / javon id'si bilan yozish rad etiladi, createShelf xatoni yashirmaydi.
// Supabase soxta (xotiradagi jadvallar) — haqiqiy bazaga hech narsa ketmaydi.

type Row = Record<string, unknown>;
const ME = "u-me";
const OTHER = "u-other";

const db: Record<string, Row[]> = {};
const fails = new Set<string>(); // "jadval:amal" — shu amal xato qaytaradi
let nextId = 100;

function query(table: string) {
  const filters: [string, unknown][] = [];
  let op: "select" | "insert" | "delete" | "upsert" = "select";
  let payload: Row | null = null;
  const matches = (r: Row) => filters.every(([k, v]) => r[k] === v);

  const run = () => {
    if (fails.has(`${table}:${op}`)) return { data: null, error: { message: "xato", code: "XX000" } };
    const rows = (db[table] ??= []);
    if (op === "insert" || op === "upsert") {
      const row = { id: nextId++, ...payload };
      rows.push(row);
      return { data: row, error: null };
    }
    if (op === "delete") {
      db[table] = rows.filter((r) => !matches(r));
      return { data: null, error: null };
    }
    return { data: rows.find(matches) ?? null, error: null };
  };

  const b = {
    select: () => b,
    eq: (k: string, v: unknown) => (filters.push([k, v]), b),
    insert: (p: Row) => ((op = "insert"), (payload = p), b),
    upsert: (p: Row) => ((op = "upsert"), (payload = p), b),
    delete: () => ((op = "delete"), b),
    maybeSingle: async () => run(),
    single: async () => run(),
    then: (resolve: (v: unknown) => void) => resolve(run()),
  };
  return b;
}

vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  getSessionUser: async () => ({ id: ME, email: null }),
  createServerSupabase: async () => ({ from: query }),
}));

const { addNote, createShelf, toggleShelfBook } = await import("@/app/actions/shelf");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  fails.clear();
  db.user_books = [
    { id: 1, user_id: ME, book_id: 10 },
    { id: 2, user_id: OTHER, book_id: 10 },
  ];
  db.shelves = [
    { id: 5, user_id: ME, name: "Meniki" },
    { id: 6, user_id: OTHER, name: "Begona" },
  ];
  db.shelf_books = [{ shelf_id: 6, book_id: 10 }];
  db.notes = [];
});

describe("addNote", () => {
  it("oʻz kitobiga qayd qoʻshadi", async () => {
    const res = await addNote(null, form({ userBookId: "1", type: "iqtibos", reference: "", content: "Yaxshi gap" }));
    expect(res.ok).toBe(true);
    expect(db.notes).toHaveLength(1);
  });

  it("begona user_book'ga qayd qoʻshmaydi", async () => {
    const res = await addNote(null, form({ userBookId: "2", type: "iqtibos", reference: "", content: "hack" }));
    expect(res.ok).toBe(false);
    expect(db.notes).toHaveLength(0);
  });
});

describe("toggleShelfBook", () => {
  it("oʻz javoniga qoʻshadi", async () => {
    expect((await toggleShelfBook(5, 10, true)).ok).toBe(true);
    expect(db.shelf_books.some((r) => r.shelf_id === 5)).toBe(true);
  });

  it("begona javonga qoʻshmaydi va undan oʻchirmaydi", async () => {
    expect((await toggleShelfBook(6, 11, true)).ok).toBe(false);
    expect((await toggleShelfBook(6, 10, false)).ok).toBe(false);
    expect(db.shelf_books).toEqual([{ shelf_id: 6, book_id: 10 }]);
  });
});

describe("createShelf", () => {
  it("javon yaratib, kitobni qoʻshadi", async () => {
    const res = await createShelf(null, form({ name: "Yangi", bookId: "10" }));
    expect(res.ok).toBe(true);
    expect(db.shelves.some((s) => s.name === "Yangi")).toBe(true);
    expect(db.shelf_books).toHaveLength(2);
  });

  it("kitobni qoʻshib boʻlmasa xato qaytaradi va boʻsh javonni qoldirmaydi", async () => {
    fails.add("shelf_books:insert");
    const res = await createShelf(null, form({ name: "Yangi", bookId: "999" }));
    expect(res.ok).toBe(false);
    expect(db.shelves.some((s) => s.name === "Yangi")).toBe(false);
  });
});
