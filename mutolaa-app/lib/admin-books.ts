import { createAdminClient } from "@/lib/supabase/admin";

// Takroriy kitoblar sahifasi (/admin/takrorlar) uchun maʼlumot — faqat admin tekshiruvidan keyin chaqiriladi.

export type MergeBook = {
  id: number;
  slug: string;
  title: string;
  author_names: string | null;
  cover_url: string | null;
  isbn: string | null;
  page_count: number | null;
  published_year: number | null;
  source: "mutolaa" | "asaxiy" | "user" | "hilol";
  formats: string[];
  publisher: string | null;
  sources: string[];
  readers: number;
};

export type DuplicatePair = { a: MergeBook; b: MergeBook; reason: string; suggestedTarget: number };

// Qaysi nusxa asosiy qolsin: Mutolaa (importer uni slug boʻyicha yangilaydi), soʻng oʻquvchilari, soʻng nashrlari koʻpi, soʻng eskisi
export function suggestTarget(a: MergeBook, b: MergeBook): number {
  const score = (x: MergeBook) => [Number(x.source === "mutolaa"), x.readers, x.sources.length, -x.id];
  const sa = score(a);
  const sb = score(b);
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] > sb[i] ? a.id : b.id;
  return a.id;
}

export async function getMergeBooks(ids: number[]): Promise<Map<number, MergeBook>> {
  const db = createAdminClient();
  const unique = [...new Set(ids)];
  const map = new Map<number, MergeBook>();
  if (!unique.length) return map;
  const [{ data: books }, { data: readers }] = await Promise.all([
    db
      .from("books")
      .select("id, slug, title, author_names, cover_url, isbn, page_count, published_year, source, formats, publishers(name), book_sources(source)")
      .in("id", unique),
    db.from("user_books").select("book_id").in("book_id", unique),
  ]);
  const readerCount = new Map<number, number>();
  for (const r of readers ?? []) readerCount.set(r.book_id as number, (readerCount.get(r.book_id as number) ?? 0) + 1);
  type Row = Omit<MergeBook, "publisher" | "sources" | "readers"> & {
    publishers: { name: string } | null;
    book_sources: { source: string }[];
  };
  for (const { publishers, book_sources, ...b } of (books ?? []) as unknown as Row[]) {
    map.set(b.id, {
      ...b,
      publisher: publishers?.name ?? null,
      sources: [...new Set(book_sources.map((s) => s.source))],
      readers: readerCount.get(b.id) ?? 0,
    });
  }
  return map;
}

export async function getDuplicatePairs(limit = 60): Promise<DuplicatePair[]> {
  const { data, error } = await createAdminClient().rpc("book_duplicate_candidates", { p_limit: limit });
  if (error) throw new Error(`Takrorlar: ${error.message}`);
  const rows = (data ?? []) as { book_a: number; book_b: number; reason: string }[];
  const books = await getMergeBooks(rows.flatMap((r) => [r.book_a, r.book_b]));
  return rows.flatMap((r) => {
    const a = books.get(r.book_a);
    const b = books.get(r.book_b);
    return a && b ? [{ a, b, reason: r.reason, suggestedTarget: suggestTarget(a, b) }] : [];
  });
}

// Qoʻlda tanlangan juftlik: kitob manzili (slug) yoki toʻliq havola
export async function getPairBySlugs(rawA: string, rawB: string): Promise<DuplicatePair | null> {
  const slugOf = (raw: string) => raw.trim().replace(/^https?:\/\/[^/]+/, "").replace(/^\/?kitob\//, "").replace(/[/?#].*$/, "");
  const slugs = [slugOf(rawA), slugOf(rawB)].filter(Boolean);
  if (slugs.length !== 2 || slugs[0] === slugs[1]) return null;
  const { data } = await createAdminClient().from("books").select("id, slug").in("slug", slugs);
  if (!data || data.length !== 2) return null;
  const books = await getMergeBooks(data.map((d) => d.id as number));
  const [a, b] = slugs.map((s) => [...books.values()].find((x) => x.slug === s)!);
  return { a, b, reason: "qoʻlda", suggestedTarget: suggestTarget(a, b) };
}
