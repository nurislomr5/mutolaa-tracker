/**
 * Mutolaa katalogini (faqat metamaʼlumot: nom, muallif, muqova, rukn, davomiylik) Supabase'ga import qilish.
 * Kitob matni yoki audiosi koʻchirilmaydi — har bir kitob Mutolaa sahifasiga havola qiladi.
 *
 *   npm run import:mutolaa                     # yangi va 7 kundan eski yozuvlarni yangilaydi
 *   npm run import:mutolaa -- --limit 20       # faqat birinchi 20 ta kitob
 *   npm run import:mutolaa -- --dry-run        # bazaga yozmaydi, natijani ekranga chiqaradi
 *   npm run import:mutolaa -- --force          # hammasini qayta yuklaydi
 *   npm run import:mutolaa -- --slug odisseya  # bitta kitob
 *
 * Kerakli env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (dry-run uchun shart emas)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "../lib/text/normalize";
import { checkHealth, loadEnv } from "./lib/common";

loadEnv();

const BASE = "https://mutolaa.com";
const USER_AGENT = "SahifaCatalogBot/1.0 (Uzbek book tracker; metadata only)";
const CONCURRENCY = 2;
const DELAY_MS = 1000;
const FLUSH_EVERY = 50;
const FRESH_DAYS = 7;

// ---------- CLI ----------
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY_RUN = flag("dry-run");
const FORCE = flag("force");
const LIMIT = option("limit") ? Number(option("limit")) : Infinity;
const ONLY_SLUG = option("slug");

// ---------- Mutolaa sahifasidagi maʼlumot shakli ----------
type Named = { id: number; name?: string; title?: string; image?: string | null; icon?: string | null; icon_color?: string | null };
type MutolaaBook = {
  id: number;
  title: string;
  slug: string;
  image?: string | null;
  publisher?: string | { name?: string } | null;
  description?: string | null;
  categories?: Named[];
  topics?: Named[];
  authors?: Named[];
  dubber?: Named[];
  all_duration?: number | null;
  has_audiobook?: boolean;
  has_ebook?: boolean;
  age?: { minimum_allowed_age?: number } | null;
  content_language?: string | null;
  is_premium?: boolean;
  avg_rating?: number | null;
  reviews_count?: number | null;
  reading_now_count?: number | null;
  audiobook?: { duration?: number; files?: { title: string; duration: number; order?: number }[] } | null;
  ebook?: { file_format?: string } | null;
};

type ParsedBook = {
  book: {
    slug: string;
    mutolaa_id: number | null;
    title: string;
    author_names: string | null;
    description: string | null;
    cover_url: string | null;
    formats: string[];
    audio_seconds: number | null;
    audio_chapters: { title: string; seconds: number }[] | null;
    narrator: string | null;
    age_limit: number | null;
    language: string | null;
    publisher: string | null;
    is_premium: boolean;
    mutolaa_rating: number | null;
    mutolaa_rating_count: number | null;
    mutolaa_reading_count: number | null;
    source: "mutolaa";
    source_url: string;
    source_raw: unknown;
    imported_at: string;
  };
  authors: { mutolaa_id: number | null; name: string; image_url: string | null }[];
  genres: { mutolaa_id: number | null; name: string }[];
  topics: { mutolaa_id: number | null; name: string; icon_url: string | null; color: string | null }[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string, attempt = 1): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "uz" } });
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    if (attempt >= 3) {
      console.warn(`  ✗ ${url}: ${(err as Error).message}`);
      return null;
    }
    await sleep(2000 * attempt * attempt);
    return fetchText(url, attempt + 1);
  }
}

async function loadSlugs(): Promise<string[]> {
  if (ONLY_SLUG) return [ONLY_SLUG];
  const xml = await fetchText(`${BASE}/sitemap.xml`);
  if (!xml) throw new Error("sitemap.xml yuklanmadi");
  const slugs = new Set<string>();
  for (const m of xml.matchAll(/<loc>https:\/\/mutolaa\.com\/uz\/book\/([^<]+)<\/loc>/g)) {
    slugs.add(decodeURIComponent(m[1]).trim());
  }
  return [...slugs];
}

// ---------- HTML -> maʼlumot ----------

// Next.js RSC oqimini (self.__next_f.push([1,"..."])) bitta matnga yigʻish
function rscPayload(html: string): string {
  let out = "";
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try {
      out += JSON.parse(`"${m[1]}"`);
    } catch {
      // buzilgan boʻlak — oʻtkazib yuboramiz
    }
  }
  return out;
}

// `start` dagi "{" dan boshlab mos keluvchi "}" gacha boʻlgan JSON obyektni kesib olish
function sliceJsonObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function findBookInPayload(payload: string, slug: string): MutolaaBook | null {
  const slugMarker = `"slug":${JSON.stringify(slug)}`;
  let from = 0;
  while (true) {
    const at = payload.indexOf('{"id":', from);
    if (at < 0) return null;
    from = at + 1;
    // kitob obyekti shu koʻrinishda boshlanadi: {"id":1347,"title":"…","slug":"odisseya",…
    const head = payload.slice(at, at + 600);
    if (!head.includes('"title":') || !head.includes(slugMarker)) continue;
    const json = sliceJsonObject(payload, at);
    if (!json) continue;
    try {
      const obj = JSON.parse(json) as MutolaaBook;
      if (obj.slug === slug && obj.title) return obj;
    } catch {
      // davom etamiz
    }
  }
}

type JsonLdBook = {
  name?: string;
  image?: string;
  description?: string;
  author?: { name?: string } | { name?: string }[];
  genre?: string | string[];
  bookFormat?: string;
  aggregateRating?: { ratingValue?: number; reviewCount?: number };
};

function findJsonLdBook(html: string): JsonLdBook | null {
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes: Record<string, unknown>[] = data["@graph"] ?? [data];
      const book = nodes.find((n) => String(n["@type"]).includes("Book"));
      if (book) return book as JsonLdBook;
    } catch {
      // davom etamiz
    }
  }
  return null;
}

const nameOf = (n: Named) => (n.name ?? n.title ?? "").trim();
const roundOrNull = (n: number | null | undefined) => (n && n > 0 ? Math.round(n) : null);

function fromMutolaa(b: MutolaaBook, slug: string): ParsedBook {
  const authors = (b.authors ?? []).filter((a) => nameOf(a));
  const formats = [b.has_ebook && "ebook", b.has_audiobook && "audio"].filter(Boolean) as string[];
  const chapters = b.has_audiobook
    ? (b.audiobook?.files ?? [])
        .slice()
        .sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
        .map((f) => ({ title: f.title, seconds: Math.round(f.duration) }))
    : [];
  const publisher = typeof b.publisher === "string" ? b.publisher : (b.publisher?.name ?? null);

  return {
    book: {
      slug,
      mutolaa_id: b.id,
      title: b.title.trim(),
      author_names: authors.map(nameOf).join(", ") || null,
      description: b.description?.trim() || null,
      cover_url: b.image ?? null,
      formats,
      audio_seconds: b.has_audiobook ? roundOrNull(b.all_duration ?? b.audiobook?.duration) : null,
      audio_chapters: chapters.length ? chapters : null,
      narrator: (b.dubber ?? []).map(nameOf).filter(Boolean).join(", ") || null,
      age_limit: b.age?.minimum_allowed_age ?? null,
      language: b.content_language ?? null,
      publisher,
      is_premium: Boolean(b.is_premium),
      mutolaa_rating: b.avg_rating ?? null,
      mutolaa_rating_count: b.reviews_count ?? null,
      mutolaa_reading_count: b.reading_now_count ?? null,
      source: "mutolaa",
      source_url: `${BASE}/uz/book/${slug}`,
      // keyin qayta parse qilish uchun — foydalanuvchiga xos va keraksiz maydonlarsiz
      source_raw: {
        id: b.id,
        title: b.title,
        slug: b.slug,
        image: b.image,
        publisher: b.publisher,
        categories: b.categories,
        topics: b.topics,
        authors: b.authors,
        dubber: b.dubber,
        all_duration: b.all_duration,
        has_audiobook: b.has_audiobook,
        has_ebook: b.has_ebook,
        age: b.age,
        content_language: b.content_language,
        is_premium: b.is_premium,
        avg_rating: b.avg_rating,
        reviews_count: b.reviews_count,
        reading_now_count: b.reading_now_count,
        ebook_format: b.ebook?.file_format ?? null,
      },
      imported_at: new Date().toISOString(),
    },
    authors: authors.map((a) => ({ mutolaa_id: a.id ?? null, name: nameOf(a), image_url: a.image ?? null })),
    genres: (b.categories ?? []).filter((c) => nameOf(c)).map((c) => ({ mutolaa_id: c.id ?? null, name: nameOf(c) })),
    topics: (b.topics ?? [])
      .filter((t) => nameOf(t))
      .map((t) => ({ mutolaa_id: t.id ?? null, name: nameOf(t), icon_url: t.icon ?? null, color: t.icon_color ?? null })),
  };
}

// Zaxira: RSC topilmasa, JSON-LD dan minimal maʼlumot
function fromJsonLd(b: JsonLdBook, slug: string): ParsedBook | null {
  if (!b.name) return null;
  const authors = (Array.isArray(b.author) ? b.author : b.author ? [b.author] : []).map((a) => a.name?.trim()).filter(Boolean) as string[];
  const genres = (Array.isArray(b.genre) ? b.genre : b.genre ? [b.genre] : []).filter(Boolean);
  return {
    book: {
      slug,
      mutolaa_id: null,
      title: b.name.trim(),
      author_names: authors.join(", ") || null,
      description: b.description?.trim() || null,
      cover_url: b.image ?? null,
      formats: b.bookFormat?.includes("EBook") ? ["ebook"] : [],
      audio_seconds: null,
      audio_chapters: null,
      narrator: null,
      age_limit: null,
      language: null,
      publisher: null,
      is_premium: false,
      mutolaa_rating: b.aggregateRating?.ratingValue ?? null,
      mutolaa_rating_count: b.aggregateRating?.reviewCount ?? null,
      mutolaa_reading_count: null,
      source: "mutolaa",
      source_url: `${BASE}/uz/book/${slug}`,
      source_raw: { jsonld: b },
      imported_at: new Date().toISOString(),
    },
    authors: authors.map((name) => ({ mutolaa_id: null, name, image_url: null })),
    genres: genres.map((name) => ({ mutolaa_id: null, name })),
    topics: [],
  };
}

function parseBookPage(html: string, slug: string): ParsedBook | null {
  const rsc = findBookInPayload(rscPayload(html), slug);
  if (rsc) return fromMutolaa(rsc, slug);
  const ld = findJsonLdBook(html);
  return ld ? fromJsonLd(ld, slug) : null;
}

// ---------- Bazaga yozish ----------

type Taxonomy = "authors" | "genres" | "topics";

// Lugʻat jadvallari (muallif/janr/rukn) uchun: kalit -> id. Kalit — mutolaa_id yoki nom slugi.
class TaxonomyCache {
  private byKey = new Map<string, number>();
  private usedSlugs = new Set<string>();

  constructor(private db: SupabaseClient, private table: Taxonomy) {}

  async load() {
    const { data, error } = await this.db.from(this.table).select("id, mutolaa_id, slug");
    if (error) throw new Error(`${this.table}: ${error.message}`);
    for (const row of data ?? []) {
      this.usedSlugs.add(row.slug);
      this.byKey.set(row.mutolaa_id != null ? `m:${row.mutolaa_id}` : `s:${row.slug}`, row.id);
    }
  }

  private key(item: { mutolaa_id: number | null; name: string }) {
    return item.mutolaa_id != null ? `m:${item.mutolaa_id}` : `s:${slugify(item.name)}`;
  }

  async resolve<T extends { mutolaa_id: number | null; name: string }>(items: T[]): Promise<Map<string, number>> {
    const unique = new Map<string, T>();
    for (const it of items) unique.set(this.key(it), it);

    const missing = [...unique.entries()].filter(([k]) => !this.byKey.has(k));
    if (missing.length) {
      const rows = missing.map(([, it]) => {
        let slug = slugify(it.name) || `${this.table}-${it.mutolaa_id}`;
        if (this.usedSlugs.has(slug)) slug = `${slug}-${it.mutolaa_id ?? Date.now()}`;
        this.usedSlugs.add(slug);
        return { ...it, slug };
      });
      const withId = rows.filter((r) => r.mutolaa_id != null);
      const withoutId = rows.filter((r) => r.mutolaa_id == null);
      for (const [batch, conflict] of [
        [withId, "mutolaa_id"],
        [withoutId, "slug"],
      ] as const) {
        if (!batch.length) continue;
        const { data, error } = await this.db.from(this.table).upsert(batch, { onConflict: conflict }).select("id, mutolaa_id, slug");
        if (error) throw new Error(`${this.table} upsert: ${error.message}`);
        for (const row of data ?? []) {
          this.byKey.set(row.mutolaa_id != null ? `m:${row.mutolaa_id}` : `s:${row.slug}`, row.id);
        }
      }
    }
    const out = new Map<string, number>();
    for (const k of unique.keys()) {
      const id = this.byKey.get(k);
      if (id != null) out.set(k, id);
    }
    return out;
  }

  idFor(item: { mutolaa_id: number | null; name: string }) {
    return this.byKey.get(this.key(item));
  }
}

async function flush(
  db: SupabaseClient,
  caches: Record<Taxonomy, TaxonomyCache>,
  batch: ParsedBook[],
) {
  if (!batch.length) return;
  await caches.authors.resolve(batch.flatMap((b) => b.authors));
  await caches.genres.resolve(batch.flatMap((b) => b.genres));
  await caches.topics.resolve(batch.flatMap((b) => b.topics));

  // Boshqa manbalar (Asaxiy) qoʻshgan formatlarni ("paper") oʻchirib yubormaslik uchun mavjudlari bilan birlashtiramiz
  const { data: existing } = await db.from("books").select("slug, formats").in("slug", batch.map((b) => b.book.slug));
  const oldFormats = new Map((existing ?? []).map((r) => [r.slug as string, r.formats as string[]]));
  const rows = batch.map((b) => ({ ...b.book, formats: [...new Set([...b.book.formats, ...(oldFormats.get(b.book.slug) ?? [])])] }));

  const { data: saved, error } = await db.from("books").upsert(rows, { onConflict: "slug" }).select("id, slug");
  if (error) throw new Error(`books upsert: ${error.message}`);
  const idBySlug = new Map((saved ?? []).map((r) => [r.slug as string, r.id as number]));
  const bookIds = [...idBySlug.values()];

  // Manba yozuvi (koʻp manbali katalog: books — asar, book_sources — qayerda bor)
  const sources = await db.from("book_sources").upsert(
    batch.map((b) => ({
      book_id: idBySlug.get(b.book.slug),
      source: "mutolaa",
      external_id: b.book.slug,
      url: b.book.source_url,
      formats: b.book.formats,
      cover_url: b.book.cover_url,
      language: b.book.language,
      last_seen_at: new Date().toISOString(),
    })),
    { onConflict: "source,external_id" },
  );
  if (sources.error) throw new Error(`book_sources upsert: ${sources.error.message}`);

  // Bogʻlanishlarni Mutolaa'dagi holatga keltirish: eskilarini oʻchirib, yangilarini yozamiz
  for (const [table, rows] of [
    [
      "book_authors",
      batch.flatMap((b) =>
        b.authors.map((a, i) => ({ book_id: idBySlug.get(b.book.slug), author_id: caches.authors.idFor(a), position: i })),
      ),
    ],
    ["book_genres", batch.flatMap((b) => b.genres.map((g) => ({ book_id: idBySlug.get(b.book.slug), genre_id: caches.genres.idFor(g) })))],
    ["book_topics", batch.flatMap((b) => b.topics.map((t) => ({ book_id: idBySlug.get(b.book.slug), topic_id: caches.topics.idFor(t) })))],
  ] as const) {
    const del = await db.from(table).delete().in("book_id", bookIds);
    if (del.error) throw new Error(`${table} delete: ${del.error.message}`);
    const valid = (rows as Record<string, unknown>[]).filter((r) => Object.values(r).every((v) => v != null));
    // bitta kitobda bir muallif ikki marta kelsa — birlamchi kalit buzilmasin
    const dedup = [...new Map(valid.map((r) => [JSON.stringify([r.book_id, r.author_id ?? r.genre_id ?? r.topic_id]), r])).values()];
    if (dedup.length) {
      const ins = await db.from(table).insert(dedup);
      if (ins.error) throw new Error(`${table} insert: ${ins.error.message}`);
    }
  }
}

async function freshSlugs(db: SupabaseClient): Promise<Set<string>> {
  const since = new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString();
  const fresh = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("books")
      .select("slug")
      .eq("source", "mutolaa")
      .gte("imported_at", since)
      .range(from, from + 999);
    if (error) throw new Error(`books: ${error.message}`);
    for (const r of data ?? []) fresh.add(r.slug);
    if (!data || data.length < 1000) break;
  }
  return fresh;
}

// ---------- Asosiy ----------

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!DRY_RUN && (!url || !key)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY kerak (yoki --dry-run)");
  }
  const db = DRY_RUN ? null : createClient(url!, key!, { auth: { persistSession: false } });
  if (db) console.log(`Baza: ${new URL(url!).host}`);

  let slugs = await loadSlugs();
  const listed = slugs.length;
  console.log(`Sitemap: ${slugs.length} ta kitob`);
  if (db && !FORCE && !ONLY_SLUG) {
    const fresh = await freshSlugs(db);
    slugs = slugs.filter((s) => !fresh.has(s));
    console.log(`Oxirgi ${FRESH_DAYS} kunda yangilanganlar oʻtkazib yuborildi: ${fresh.size}`);
  }
  if (db) {
    // Takror sifatida boshqa kitobga qoʻshilgan (admin birlashtirgan) kitoblar qayta yaratilmasin
    const { data: merged, error } = await db.from("book_redirects").select("old_slug");
    if (error) throw new Error(`book_redirects: ${error.message}`);
    const mergedSlugs = new Set((merged ?? []).map((r) => r.old_slug as string));
    const before = slugs.length;
    slugs = slugs.filter((s) => !mergedSlugs.has(s));
    if (before !== slugs.length) console.log(`Birlashtirilgan (takror) kitoblar oʻtkazib yuborildi: ${before - slugs.length}`);
  }
  slugs = slugs.slice(0, LIMIT);
  console.log(`Yuklanadi: ${slugs.length} ta`);

  const caches = db
    ? { authors: new TaxonomyCache(db, "authors"), genres: new TaxonomyCache(db, "genres"), topics: new TaxonomyCache(db, "topics") }
    : null;
  if (caches) await Promise.all(Object.values(caches).map((c) => c.load()));

  let pending: ParsedBook[] = [];
  let ok = 0;
  let failed = 0;
  let queue = 0;
  const startedAt = Date.now();

  async function worker() {
    while (queue < slugs.length) {
      const slug = slugs[queue++];
      const html = await fetchText(`${BASE}/uz/book/${encodeURIComponent(slug)}`);
      const parsed = html ? parseBookPage(html, slug) : null;
      if (!parsed) {
        failed++;
        console.warn(`  ✗ ${slug}: maʼlumot topilmadi`);
      } else if (DRY_RUN) {
        ok++;
        console.log(
          JSON.stringify({
            ...parsed.book,
            source_raw: undefined,
            audio_chapters: parsed.book.audio_chapters?.length,
            description: parsed.book.description?.slice(0, 60),
            genres: parsed.genres.map((g) => g.name),
            topics: parsed.topics.map((t) => t.name),
          }),
        );
      } else {
        ok++;
        pending.push(parsed);
        if (pending.length >= FLUSH_EVERY) {
          const batch = pending;
          pending = [];
          await flush(db!, caches!, batch);
          const done = ok + failed;
          const rate = done / ((Date.now() - startedAt) / 1000);
          console.log(`  ✓ ${done}/${slugs.length} (${Math.round((slugs.length - done) / rate / 60)} daq qoldi)`);
        }
      }
      await sleep(DELAY_MS);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (db) await flush(db, caches!, pending);

  console.log(`Tayyor: ${ok} ta ${DRY_RUN ? "oʻqildi" : "saqlandi"}, ${failed} ta xato, ${Math.round((Date.now() - startedAt) / 1000)} s`);
  checkHealth("Mutolaa", { listed, attempted: slugs.length, ok, failed });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
