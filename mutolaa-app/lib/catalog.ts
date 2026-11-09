import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

// Katalog maʼlumotlari kamdan-kam oʻzgaradi (import haftasiga bir marta) — soatlab keshlanadi.
// Xato boʻlsa throw qilamiz: 'use cache' xatoni keshlamaydi, sahifadagi error.tsx koʻrsatadi.

export const PAGE_SIZE = 24;

const CARD_COLUMNS = "id, slug, title, author_names, cover_url, formats, mutolaa_rating, audio_seconds, is_premium";

export type BookFormat = "ebook" | "audio" | "paper";

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
  source: "mutolaa" | "asaxiy" | "user";
  created_by: string | null;
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
  isbn: string | null;
  page_count: number | null;
  published_year: number | null;
  translator: string | null;
  script: "latin" | "cyrillic" | null;
  publisherRef: { name: string; slug: string } | null;
  sources: BookSource[];
};

// Kitob qayerda bor: Mutolaa (audio/e-kitob) yoki doʻkondagi qogʻoz nashr (Asaxiy)
export type BookSource = {
  source: "mutolaa" | "asaxiy" | "hilol";
  url: string;
  formats: BookFormat[];
  isbn: string | null;
  price: number | null;
  in_stock: boolean | null;
  page_count: number | null;
  published_year: number | null;
  cover_type: string | null;
  script: "latin" | "cyrillic" | null;
  publisher: { name: string; slug: string } | null;
};

export type Publisher = { name: string; slug: string; count: number };

export type Topic = { name: string; slug: string; color: string | null; count: number };

export type CatalogSort = "relevance" | "popular" | "rating" | "new" | "title";
export type BookScript = "latin" | "cyrillic";
export type BookSize = "short" | "medium" | "long";
// Nashr tili (book_sources.langs): Mutolaa — oʻzbekcha, Asaxiy yozuvlari uz/ru/en/other ga ajratiladi
export type BookLang = "uz" | "ru" | "en" | "other";

export type CatalogQuery = {
  q?: string;
  topic?: string;
  publisher?: string;
  format?: BookFormat;
  script?: BookScript;
  size?: BookSize;
  lang?: BookLang;
  inStock?: boolean;
  sort?: CatalogSort;
  page?: number;
};

function fail(what: string, message: string): never {
  throw new Error(`${what}: ${message}`);
}

export async function getCatalog({ q = "", topic, publisher, format, script, size, lang, inStock, sort, page = 1 }: CatalogQuery) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");

  const db = createPublicClient();
  // RPC natijasini PostgREST faqat select'dagi ustunlar boʻyicha saralay oladi
  const sortColumns = `${CARD_COLUMNS}, mutolaa_rating_count, mutolaa_reading_count, search_text, first_seen_at, published_year`;
  let columns = sortColumns;
  if (topic) columns += ", book_topics!inner(topics!inner(slug))";
  // nashriyot, til va "sotuvda bor" — search_catalog ichida (nashriyot kitobning nashrlari orqali ham)
  let query = db
    .rpc("search_catalog", { q, p_publisher: publisher ?? null, p_lang: lang ?? null, p_in_stock: Boolean(inStock) }, { count: "exact" })
    .select(columns);

  if (topic) query = query.eq("book_topics.topics.slug", topic);
  if (format) query = query.contains("formats", [format]);
  if (script) query = query.eq("script", script);
  if (size === "short") query = query.gt("page_count", 0).lt("page_count", 200);
  if (size === "medium") query = query.gte("page_count", 200).lte("page_count", 400);
  if (size === "long") query = query.gt("page_count", 400);

  // relevance — search_books oʻzi tartiblaydi (qidiruv boʻlmasa mashhurlik boʻyicha)
  if (sort === "popular") query = query.order("mutolaa_reading_count", { ascending: false, nullsFirst: false });
  if (sort === "rating")
    query = query
      .order("mutolaa_rating", { ascending: false, nullsFirst: false })
      .order("mutolaa_rating_count", { ascending: false, nullsFirst: false });
  // yangilari: oxirgi chop etilgan yil, soʻng katalogga qoʻshilgan vaqt
  if (sort === "new")
    query = query
      .order("published_year", { ascending: false, nullsFirst: false })
      .order("first_seen_at", { ascending: false });
  // search_text — tirnoq va belgilarsiz, kichik harfli nom: «Naqadar…» N harfida turadi
  if (sort === "title") query = query.order("search_text", { ascending: true });

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  // sahifa raqami juda katta boʻlsa PostgREST 416 qaytaradi — boʻsh natija sifatida koʻrsatamiz
  if (error && error.code !== "PGRST103") fail("Katalog", error.message);
  // filtr uchun qoʻshilgan bogʻlanish ustunlarini kartochkaga uzatmaymiz
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
       mutolaa_reading_count, source, created_by, source_url, isbn, page_count, published_year, translator, script,
       publisherRef:publishers(name, slug),
       sources:book_sources(source, url, formats, isbn, price, in_stock, page_count, published_year, cover_type, script, publisher:publishers(name, slug)),
       book_authors(position, authors(name, slug, image_url)),
       book_genres(genres(name, slug)),
       book_topics(topics(name, slug, color))`,
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail("Kitob", error.message);
  if (!data) return null;

  type Row = Omit<BookDetail, "authors" | "genres" | "topics" | "sources"> & {
    sources: BookSource[];
    book_authors: { position: number; authors: BookDetail["authors"][number] }[];
    book_genres: { genres: BookDetail["genres"][number] }[];
    book_topics: { topics: BookDetail["topics"][number] }[];
  };
  const { book_authors, book_genres, book_topics, ...rest } = data as unknown as Row;
  // Avval Mutolaa (oʻqish/tinglash), soʻng mavjud qogʻoz nashrlar arzonidan
  const sources = [...rest.sources].sort(
    (a, b) =>
      Number(b.source === "mutolaa") - Number(a.source === "mutolaa") ||
      Number(b.in_stock) - Number(a.in_stock) ||
      (a.price ?? Infinity) - (b.price ?? Infinity),
  );
  return {
    ...rest,
    sources,
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
    .select(`id, name, slug, image_url, book_authors(books(${CARD_COLUMNS}, mutolaa_reading_count))`)
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail("Muallif", error.message);
  if (!data) return null;

  const row = data as unknown as {
    id: number;
    name: string;
    slug: string;
    image_url: string | null;
    book_authors: { books: BookCardData & { mutolaa_reading_count: number | null } }[];
  };
  const books = row.book_authors
    .map((ba) => ba.books)
    .sort((a, b) => (b.mutolaa_reading_count ?? 0) - (a.mutolaa_reading_count ?? 0));
  return { id: row.id, name: row.name, slug: row.slug, image_url: row.image_url, books };
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

export async function getPublishers() {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");

  // kitoblar soni nashrlar (book_sources) orqali bogʻlanganlari bilan birga, takrorsiz
  const { data, error } = await createPublicClient().rpc("publisher_book_counts");
  if (error) fail("Nashriyotlar", error.message);
  return ((data ?? []) as { name: string; slug: string; count: number | string }[])
    .map((p): Publisher => ({ name: p.name, slug: p.slug, count: Number(p.count) }))
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function getPublisher(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");

  const { data, error } = await createPublicClient().from("publishers").select("id, name, slug").eq("slug", slug).maybeSingle();
  if (error) fail("Nashriyot", error.message);
  return (data as { id: number; name: string; slug: string } | null) ?? null;
}

// Bosh sahifa: eng soʻnggi qogʻoz nashrlar (chop etilgan yili, soʻng katalogga qoʻshilgani boʻyicha)
export async function getNewPaperBooks(limit: number) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");

  const { data, error } = await createPublicClient()
    .from("books")
    .select(CARD_COLUMNS)
    .contains("formats", ["paper"])
    .not("cover_url", "is", null)
    .order("published_year", { ascending: false, nullsFirst: false })
    .order("first_seen_at", { ascending: false })
    .limit(limit);
  if (error) fail("Yangi kitoblar", error.message);
  return (data ?? []) as unknown as BookCardData[];
}
