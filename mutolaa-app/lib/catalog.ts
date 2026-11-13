import { cacheLife, cacheTag } from "next/cache";
import { hasCleanTitle, isCyrillic, orderPublishers, pickDiverse, uniqueByTitle } from "@/lib/showcase";
import { createPublicClient } from "@/lib/supabase/public";

// Katalog maʼlumotlari kamdan-kam oʻzgaradi (import haftasiga bir marta) — soatlab keshlanadi.
// Xato boʻlsa throw qilamiz: 'use cache' xatoni keshlamaydi, sahifadagi error.tsx koʻrsatadi.

export const PAGE_SIZE = 24;

export const CARD_COLUMNS = "id, slug, title, author_names, cover_url, formats, mutolaa_rating, audio_seconds, is_premium";

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
  source: "mutolaa" | "asaxiy" | "user" | "hilol";
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

// uzCount — oʻzbek tilidagi kitoblari soni (publisher_book_counts, 20261116000019); eski bazada boʻlmaydi
export type Publisher = { name: string; slug: string; count: number; uzCount?: number };

export type Topic = { id: number; name: string; slug: string; color: string | null; count: number };

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
  let columns = `${CARD_COLUMNS}, mutolaa_rating_count, mutolaa_reading_count, search_text, first_seen_at, published_year`;
  if (topic) columns += ", book_topics!inner(topics!inner(slug))";

  // Qidiruv soʻzi boʻlmasa (katalogni varaqlash, nashriyot sahifasi) — toʻgʻridan-toʻgʻri jadvaldan:
  // search_catalog har chaqiruvda mos kelgan barcha kitoblarni toʻliq satrlari bilan yigʻib saralaydi (~0,7 s),
  // bir vaqtda kelgan bir nechta soʻrov esa bazaning 3 soniyalik chegarasidan oshib ketardi.
  const browsing = !q.trim();
  let query;
  if (browsing) {
    const publisherId = publisher ? (await getPublisher(publisher))?.id : undefined;
    if (publisher && !publisherId) return { books: [], total: 0 };
    // nashriyot: kitobning oʻzi yoki biror nashri orqali; til va "sotuvda bor" — bitta nashrga tegishli
    if (publisherId) columns += ", by_publisher:book_sources(id)";
    if (lang || inStock) columns += ", edition:book_sources!inner(id)";
    query = db.from("books").select(columns, { count: "exact" });
    if (publisherId)
      query = query.eq("by_publisher.publisher_id", publisherId).or(`publisher_id.eq.${publisherId},by_publisher.not.is.null`);
    if (lang) query = query.contains("edition.langs", [lang]);
    if (inStock) query = query.is("edition.in_stock", true);
  } else {
    // nashriyot, til va "sotuvda bor" — search_catalog ichida (nashriyot kitobning nashrlari orqali ham)
    query = db
      .rpc("search_catalog", { q, p_publisher: publisher ?? null, p_lang: lang ?? null, p_in_stock: Boolean(inStock) }, { count: "exact" })
      .select(columns);
  }

  if (topic) query = query.eq("book_topics.topics.slug", topic);
  if (format) query = query.contains("formats", [format]);
  if (script) query = query.eq("script", script);
  if (size === "short") query = query.gt("page_count", 0).lt("page_count", 200);
  if (size === "medium") query = query.gte("page_count", 200).lte("page_count", 400);
  if (size === "long") query = query.gt("page_count", 400);

  // relevance — search_catalog oʻzi tartiblaydi; qidiruvsiz esa mashhurlik boʻyicha
  if (sort === "popular" || (browsing && (!sort || sort === "relevance")))
    query = query.order("mutolaa_reading_count", { ascending: false, nullsFirst: false });
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
  // teng qiymatlarda sahifalar orasida kitob takrorlanmasin yoki tushib qolmasin
  if (browsing || sort) query = query.order("id");

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  // sahifa raqami juda katta boʻlsa PostgREST 416 qaytaradi — boʻsh natija sifatida koʻrsatamiz
  if (error && error.code !== "PGRST103") fail("Katalog", error.message);
  // filtr uchun qoʻshilgan bogʻlanish ustunlarini kartochkaga uzatmaymiz
  type Row = BookCardData & { book_topics?: unknown; by_publisher?: unknown; edition?: unknown };
  const books = ((data ?? []) as unknown as Row[]).map((b) => {
    delete b.book_topics;
    delete b.by_publisher;
    delete b.edition;
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
    .select("id, name, slug, color, book_topics(count)")
    .order("name");
  if (error) fail("Ruknlar", error.message);
  return ((data ?? []) as unknown as { id: number; name: string; slug: string; color: string | null; book_topics: { count: number }[] }[])
    .map((t): Topic => ({ id: t.id, name: t.name, slug: t.slug, color: t.color, count: t.book_topics[0]?.count ?? 0 }))
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

// Birlashtirilgan (oʻchirilgan) kitobning eski manzili -> asosiy kitob slug'i (book_redirects, 20261110000011)
export async function getBookRedirect(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog", `book:${slug}`);

  const { data } = await createPublicClient().from("book_redirects").select("books!inner(slug)").eq("old_slug", slug).maybeSingle();
  return (data as unknown as { books: { slug: string } } | null)?.books.slug ?? null;
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
  const publishers = ((data ?? []) as { name: string; slug: string; count: number | string; uz_count?: number | string | null }[])
    .map((p): Publisher => ({
      name: p.name,
      slug: p.slug,
      count: Number(p.count),
      ...(p.uz_count == null ? {} : { uzCount: Number(p.uz_count) }),
    }))
    .filter((p) => p.count > 0);
  // avval oʻzbek nashriyotlari, soʻng qolganlari
  return orderPublishers(publishers);
}

export async function getPublisher(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");

  const { data, error } = await createPublicClient().from("publishers").select("id, name, slug").eq("slug", slug).maybeSingle();
  if (error) fail("Nashriyot", error.message);
  return (data as { id: number; name: string; slug: string } | null) ?? null;
}

// Bosh sahifa: oʻzbek tilidagi eng soʻnggi bosma nashrlar (chop etilgan yili, soʻng katalogga qoʻshilgani boʻyicha).
// Muqovasi bor va nomi toza kitoblar olinadi; bitta nashriyot vitrinani egallab olmasligi uchun
// ketma-ket ikkitadan ortiq kitobi chiqmaydi. Lotin yozuvidagi nomlar yetarli boʻlsa, kirillchalari qoʻshilmaydi.
// Xato otilmaydi (getSimilarBooks kabi): boʻlim ixtiyoriy, xato boʻlsa bosh sahifa usiz ochiladi.
const NEW_BOOKS_POOL = 400;

export async function getNewPaperBooks(limit: number): Promise<BookCardData[]> {
  "use cache";
  cacheTag("catalog");

  // doʻkon sahifasidagi xato yillar ("20241") roʻyxat boshiga chiqib qolmasin
  const maxYear = new Date().getFullYear() + 1;
  const { data, error } = await createPublicClient()
    .from("books")
    .select(`${CARD_COLUMNS}, publisher_id, edition:book_sources!inner(publisher_id)`)
    .contains("formats", ["paper"])
    .not("cover_url", "is", null)
    // aynan bosma nashrning oʻzi oʻzbek tilida boʻlsin
    .contains("edition.langs", ["uz"])
    .contains("edition.formats", ["paper"])
    .or(`published_year.is.null,published_year.lte.${maxYear}`)
    .order("published_year", { ascending: false, nullsFirst: false })
    .order("first_seen_at", { ascending: false })
    .order("id")
    .limit(NEW_BOOKS_POOL);
  if (error) {
    console.error("[yangi kitoblar]", error.message);
    cacheLife("minutes");
    return [];
  }
  cacheLife("hours");

  type Row = BookCardData & { publisher_id?: number | null; edition?: { publisher_id: number | null }[] };
  const publisherOf = (b: Row) => b.publisher_id ?? b.edition?.find((e) => e.publisher_id != null)?.publisher_id ?? null;
  const clean = uniqueByTitle(((data ?? []) as unknown as Row[]).filter((b) => hasCleanTitle(b.title)));
  const latin = clean.filter((b) => !isCyrillic(b.title));
  return pickDiverse(latin.length >= limit ? latin : clean, publisherOf, limit).map((b) => {
    const card = { ...b };
    delete card.publisher_id;
    delete card.edition;
    return card as BookCardData;
  });
}

// Kitob sahifasi: rukn va janrlari mos kitoblar (similar_books, 20261114000016). Tartibni funksiya oʻzi beradi.
// Xato otilmaydi: "use cache" ichidagi xato sahifani build paytida ham yiqitadi, boʻlim esa ixtiyoriy.
// Xato boʻlsa null qisqa muddatga keshlanadi — baza tuzalgach bir daqiqada oʻzi toʻgʻrilanadi.
export async function getSimilarBooks(bookId: number, limit = 6): Promise<BookCardData[] | null> {
  "use cache";
  cacheTag("catalog");
  const { data, error } = await createPublicClient().rpc("similar_books", { p_book_id: bookId, p_limit: limit }).select(CARD_COLUMNS);
  if (error) {
    console.error("[oʻxshash kitoblar]", error.message);
    cacheLife("minutes");
    return null;
  }
  cacheLife("hours");
  return (data ?? []) as unknown as BookCardData[];
}
