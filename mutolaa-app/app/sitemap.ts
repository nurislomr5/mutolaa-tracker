import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { siteUrl } from "@/lib/site";
import { createPublicClient } from "@/lib/supabase/public";

// Google uchun barcha ochiq sahifalar: kitoblar, mualliflar, nashriyotlar, ochiq profillar (~16 ming URL — bitta sitemap yetadi)

type Row = Record<string, unknown>;

// Supabase bir soʻrovda koʻpi bilan 1000 qator qaytaradi — sahifalab oʻqiymiz
async function all(table: string, columns: string, eq?: [string, unknown]) {
  const db = createPublicClient();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let query = db.from(table).select(columns).order("id").range(from, from + 999);
    if (eq) query = query.eq(eq[0], eq[1]);
    const { data, error } = await query;
    if (error) throw new Error(`sitemap ${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("days");

  const base = siteUrl();
  const [books, authors, publishers, profiles] = await Promise.all([
    all("books", "slug, updated_at"),
    all("authors", "slug, book_authors(count)"),
    all("publishers", "slug, books(count)"),
    all("profiles", "username", ["is_public", true]),
  ]);
  const hasBooks = (r: Row, rel: string) => ((r[rel] as { count: number }[] | undefined)?.[0]?.count ?? 0) > 0;

  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/kitoblar`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/nashriyotlar`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/ruknlar`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/maxfiylik`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/shartlar`, changeFrequency: "yearly", priority: 0.2 },
    ...books.map((b) => ({
      url: `${base}/kitob/${b.slug}`,
      lastModified: b.updated_at ? new Date(b.updated_at as string) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...authors.filter((a) => hasBooks(a, "book_authors")).map((a) => ({ url: `${base}/muallif/${a.slug}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...publishers.filter((p) => hasBooks(p, "books")).map((p) => ({ url: `${base}/nashriyot/${p.slug}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...profiles.map((p) => ({ url: `${base}/u/${p.username}`, changeFrequency: "weekly" as const, priority: 0.3 })),
  ];
}
