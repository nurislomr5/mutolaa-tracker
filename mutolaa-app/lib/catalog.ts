import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

// Katalog maʼlumotlari kamdan-kam oʻzgaradi (import haftasiga bir marta) — soatlab keshlanadi.
// Xato boʻlsa throw qilamiz: 'use cache' xatoni keshlamaydi, sahifadagi error.tsx koʻrsatadi.

export const PAGE_SIZE = 24;

const CARD_COLUMNS = "id, slug, title, author_names, cover_url, formats, mutolaa_rating, audio_seconds, is_premium";

export type BookFormat = "ebook" | "audio";

export type BookCardData = {
  id: number;
  slug: string;
  title: string;
  author_names: string | null;
  cover_url: string | null;
  formats: BookFormat[];
  mutolaa_rating: number | null;
  audio_seconds: number | null;
  is_premium: boolean;
};

export type BookDetail = BookCardData & {
  description: string | null;
  audio_chapters: { title: string; seconds: number }[] | null;
  narrator: string | null;
  age_limit: number | null;
  publisher: string | null;
  mutolaa_rating_count: number | null;
  mutolaa_reading_count: number | null;
  source_url: string | null;
  authors: { name: string; slug: string; image_url: string | null }[];
  genres: { name: string; slug: string }[];
  topics: { name: string; slug: string; color: string | null }[];
};

export type Topic = { name: string; slug: string; color: string | null; count: number };

export type CatalogSort = "relevance" | "popular" | "rating" | "new" | "title";

export type CatalogQuery = {
  q?: string;
  topic?: string;
  format?: BookFormat;
  sort?: CatalogSort;
  page?: number;
};

function fail(what: string, message: string): never {
  throw new Error(`${what}: ${message}`);
}

export async function getCatalog({ q = "", topic, format, sort, page = 1 }: CatalogQuery) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");

  const db = createPublicClient();
  // RPC natijasini PostgREST faqat select'dagi ustunlar boʻyicha saralay oladi
  const sortColumns = `${CARD_COLUMNS}, mutolaa_id, mutolaa_rating_count, mutolaa_reading_count, search_text`;
  const columns = topic ? `${sortColumns}, book_topics!inner(topics!inner(slug))` : sortColumns;
  let query = db.rpc("search_books", { q }, { count: "exact" }).select(columns);

  if (topic) query = query.eq("book_topics.topics.slug", topic);
  if (format) query = query.contains("formats", [format]);

  // relevance — search_books oʻzi tartiblaydi (qidiruv boʻlmasa mashhurlik boʻyicha)
  if (sort === "popular") query = query.order("mutolaa_reading_count", { ascending: false, nullsFirst: false });
  if (sort === "rating")
    query = query
      .order("mutolaa_rating", { ascending: false, nullsFirst: false })
      .order("mutolaa_rating_count", { ascending: false, nullsFirst: false });
  if (sort === "new") query = query.order("mutolaa_id", { ascending: false, nullsFirst: false });
  // search_text — tirnoq va belgilarsiz, kichik harfli nom: «Naqadar…» N harfida turadi
  if (sort === "title") query = query.order("search_text", { ascending: true });

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  // sahifa raqami juda katta boʻlsa PostgREST 416 qaytaradi — boʻsh natija sifatida koʻrsatamiz
  if (error && error.code !== "PGRST103") fail("Katalog", error.message);
  // rukn filtri uchun qoʻshilgan book_topics ustunini kartochkaga uzatmaymiz
  const books = ((data ?? []) as unknown as (BookCardData & { book_topics?: unknown })[]).map((b) => {
    delete b.book_topics;
    return b as BookCardData;
  });
  return { books, total: count ?? 0 };
}

export async function getPopularBooks(limit: number) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");

  const { data, error } = await createPublicClient()
    .from("books")
    .select(CARD_COLUMNS)
    .order("mutolaa_reading_count", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) fail("Mashhur kitoblar", error.message);
  return (data ?? []) as unknown as BookCardData[];
}

export async function getTopics() {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");

  const { data, error } = await createPublicClient()
    .from("topics")
    .select("name, slug, color, book_topics(count)")
    .order("name");
  if (error) fail("Ruknlar", error.message);
  return ((data ?? []) as unknown as { name: string; slug: string; color: string | null; book_topics: { count: number }[] }[])
    .map((t): Topic => ({ name: t.name, slug: t.slug, color: t.color, count: t.book_topics[0]?.count ?? 0 }))
    .filter((t) => t.count > 0);
}

export async function getBook(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog", `book:${slug}`);

  const { data, error } = await createPublicClient()
    .from("books")
    .select(
      `${CARD_COLUMNS}, description, audio_chapters, narrator, age_limit, publisher, mutolaa_rating_count,
       mutolaa_reading_count, source_url,
       book_authors(position, authors(name, slug, image_url)),
       book_genres(genres(name, slug)),
       book_topics(topics(name, slug, color))`,
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail("Kitob", error.message);
  if (!data) return null;

  type Row = Omit<BookDetail, "authors" | "genres" | "topics"> & {
    book_authors: { position: number; authors: BookDetail["authors"][number] }[];
    book_genres: { genres: BookDetail["genres"][number] }[];
    book_topics: { topics: BookDetail["topics"][number] }[];
  };
  const { book_authors, book_genres, book_topics, ...rest } = data as unknown as Row;
  return {
    ...rest,
    authors: book_authors.sort((a, b) => a.position - b.position).map((a) => a.authors),
    genres: book_genres.map((g) => g.genres),
    topics: book_topics.map((t) => t.topics),
  } satisfies BookDetail;
}

export async function getAuthor(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog", `author:${slug}`);

  const { data, error } = await createPublicClient()
    .from("authors")
    .select(`name, slug, image_url, book_authors(books(${CARD_COLUMNS}, mutolaa_reading_count))`)
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail("Muallif", error.message);
  if (!data) return null;

  const row = data as unknown as {
    name: string;
    slug: string;
    image_url: string | null;
    book_authors: { books: BookCardData & { mutolaa_reading_count: number | null } }[];
  };
  const books = row.book_authors
    .map((ba) => ba.books)
    .sort((a, b) => (b.mutolaa_reading_count ?? 0) - (a.mutolaa_reading_count ?? 0));
  return { name: row.name, slug: row.slug, image_url: row.image_url, books };
}

export async function getPopularAuthorSlugs(limit: number) {
  "use cache";
  cacheLife("hours");

  const { data, error } = await createPublicClient()
    .from("books")
    .select("book_authors(authors(slug))")
    .order("mutolaa_reading_count", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) fail("Mualliflar", error.message);
  const rows = (data ?? []) as unknown as { book_authors: { authors: { slug: string } }[] }[];
  return [...new Set(rows.flatMap((r) => r.book_authors.map((ba) => ba.authors.slug)))];
}
