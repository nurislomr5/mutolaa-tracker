/**
 * Hilol-Nashr (kitoblardunyosi.uz) qogʻoz kitoblar katalogini (faqat metamaʼlumot) Supabase'ga import qilish.
 * Har bir kitob mavjud asar bilan (ISBN yoki "nom + muallif" boʻyicha) birlashtiriladi va
 * nashr maʼlumoti (narx, betlar soni, nashriyot, ISBN) book_sources jadvaliga (source = 'hilol') yoziladi.
 *
 *   npm run import:hilol                         # yangi va 7 kundan eski yozuvlar
 *   npm run import:hilol -- --pages 1 --dry-run  # 1 ta sahifa, bazaga yozmasdan
 *   npm run import:hilol -- --limit 20           # faqat 20 ta kitob
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PUBLISHER_NAMES, publisherSlug } from "../lib/publishers";
import { slugify, uzNormalize } from "../lib/text/normalize";
import { checkHealth, cliArgs, createAdmin, decodeHtml, fetchText, loadEnv, runPool } from "./lib/common";

loadEnv();

const BASE = "https://kitoblardunyosi.uz";
const CONCURRENCY = 2;
const DELAY_MS = 1000;
const FRESH_DAYS = 7;

const cli = cliArgs();
const DRY_RUN = cli.flag("dry-run");
const FORCE = cli.flag("force");
const ONLY_SLUG = cli.option("slug");
const MAX_PAGES = cli.option("pages") ? Number(cli.option("pages")) : 20;

export type ParsedHilol = {
  slug: string;
  url: string;
  title: string;
  authors: string[];
  cover_url: string | null;
  isbn: string | null;
  page_count: number | null;
  published_year: number | null;
  publisher: string | null;
  cover_type: string | null;
  script: "latin" | "cyrillic" | null;
  price: number | null;
  in_stock: boolean;
};

function stripTags(html: string) {
  return decodeHtml(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function parseHilolPage(html: string, slug: string): ParsedHilol | null {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1 ? stripTags(h1[1]) : "";
  if (!title) return null;

  const text = stripTags(html);
  const field = (label: string) => {
    const re = new RegExp(`(?:${label})\\s*[:\\-–]?\\s*([^\\n.;]{2,90})`, "i");
    return html
      .replace(/<\/(?:p|li|tr|div)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .match(re)?.[1]
      ?.replace(/\s+/g, " ")
      .trim();
  };

  const rawAuthor = field("Muallif(?:lar)?|Муаллиф(?:лар)?");
  const authors = rawAuthor
    ? rawAuthor
        .split(/\s*,\s*/)
        .map((a) => a.trim())
        .filter((a) => a.length > 1 && a.length < 80)
    : [];

  const isbnMatch = text.match(/ISBN\s*[:\-–]?\s*([0-9Xx\-]{10,20})/i);
  const isbn = isbnMatch ? isbnMatch[1].replace(/[^0-9Xx-]/g, "") : null;
  if (!authors.length && !isbn) return null;

  const pageMatch = text.match(/(?:Betlar soni|Ҳажми|Hajmi)\s*[:\-–]?\s*(\d{2,4})(?:\s*(?:bet|бет))?/i);
  const yearMatch = text.match(/(?:Sana|Nashr yili|Нашр йили|Йили)\s*[:\-–]?\s*(19\d{2}|20\d{2})/i);
  const publisher = field("Nashriyot|Нашриёт") ?? "Hilol-Nashr";
  const coverType = field("Muqova(?:si)?|Муқова(?:си)?") ?? null;
  const yozuv = (field("Yozuv|Ёзув|Alifbo|Алифбо") ?? "").toLowerCase();
  const script: "latin" | "cyrillic" | null =
    yozuv.includes("lotin") || yozuv.includes("лотин")
      ? "latin"
      : yozuv.includes("kirill") || yozuv.includes("кирил")
        ? "cyrillic"
        : /[а-яўқғҳ]/i.test(title)
          ? "cyrillic"
          : "latin";

  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;
  const priceMatch = html.match(/(\d[\d\s]{2,10})\s*(?:so['ʻ’]?m|сўм)/i);
  const price = priceMatch ? Number(priceMatch[1].replace(/\s+/g, "")) : null;
  const outOfStock = /sotuvda yo['ʻ’]?q|сотувда йўқ|tugagan|тугаган/i.test(text);

  return {
    slug,
    url: `${BASE}/${slug}`,
    title,
    authors,
    cover_url: ogImage,
    isbn,
    page_count: pageMatch ? Number(pageMatch[1]) : null,
    published_year: yearMatch ? Number(yearMatch[1]) : null,
    publisher,
    cover_type: coverType,
    script,
    price: price && price > 0 ? price : null,
    in_stock: !outOfStock,
  };
}

async function collectSlugs(): Promise<string[]> {
  if (ONLY_SLUG) return [ONLY_SLUG];
  const slugs = new Set<string>();
  const skip = new Set(["hilol-nashr", "login", "register", "cart", "checkout", "contact", "about_us", "delivery", "privacy", "terms"]);

  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await fetchText(`${BASE}/hilol-nashr?page=${page}`);
    if (!html) break;
    const before = slugs.size;
    for (const m of html.matchAll(/href=["']https:\/\/kitoblardunyosi\.uz\/([a-z0-9-]+)["']/gi)) {
      const s = m[1].toLowerCase();
      if (!skip.has(s) && s.length > 2) slugs.add(s);
    }
    if (slugs.size === before) break;
  }
  return [...slugs];
}

async function saveHilol(db: SupabaseClient, p: ParsedHilol) {
  const pubSlug = publisherSlug(p.publisher ?? "Hilol-Nashr");
  const { data: pubRow } = await db
    .from("publishers")
    .upsert({ name: PUBLISHER_NAMES[pubSlug] ?? p.publisher ?? "Hilol-Nashr", slug: pubSlug }, { onConflict: "slug" })
    .select("id")
    .single();
  const publisherId = (pubRow?.id as number | undefined) ?? null;

  let bookId: number | null = null;
  const { data: prev } = await db.from("book_sources").select("book_id").eq("source", "hilol").eq("external_id", p.slug).maybeSingle();
  if (prev) bookId = prev.book_id;

  if (!bookId && p.isbn) {
    const { data: byIsbn } = await db.from("book_sources").select("book_id").eq("isbn", p.isbn).limit(1);
    if (byIsbn?.length) bookId = byIsbn[0].book_id;
  }

  if (!bookId) {
    const key = uzNormalize(`${p.title} ${p.authors.join(", ")}`);
    const { data: exact } = await db.from("books").select("id").eq("search_text", key).limit(1);
    if (exact?.length) bookId = exact[0].id;
  }

  if (!bookId) {
    const base = slugify(`${p.title} ${p.authors[0] ?? ""}`) || p.slug;
    let bookSlug = base;
    for (let i = 2; ; i++) {
      const { data } = await db.from("books").select("id").eq("slug", bookSlug).maybeSingle();
      if (!data) break;
      bookSlug = `${base}-${i}`;
    }
    const { data: created, error } = await db
      .from("books")
      .insert({
        slug: bookSlug,
        title: p.title,
        author_names: p.authors.join(", ") || null,
        cover_url: p.cover_url,
        formats: ["paper"],
        isbn: p.isbn,
        page_count: p.page_count,
        publisher_id: publisherId,
        published_year: p.published_year,
        script: p.script,
        language: "uz",
        source: "asaxiy",
        source_url: p.url,
        imported_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(`books insert (${p.slug}): ${error.message}`);
    bookId = created.id as number;
  }

  const { error } = await db.from("book_sources").upsert(
    {
      book_id: bookId,
      source: "hilol",
      external_id: p.slug,
      url: p.url,
      formats: ["paper"],
      isbn: p.isbn,
      publisher_id: publisherId,
      page_count: p.page_count,
      published_year: p.published_year,
      cover_url: p.cover_url,
      cover_type: p.cover_type,
      script: p.script,
      language: "uz",
      price: p.price,
      in_stock: p.in_stock,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "source,external_id" },
  );
  if (error) throw new Error(`book_sources (${p.slug}): ${error.message}`);
}

async function main() {
  const db = DRY_RUN ? null : createAdmin();
  let slugs = await collectSlugs();
  const listed = slugs.length;
  console.log(`Hilol-Nashr: ${slugs.length} ta mahsulot`);
  if (db && !FORCE && !ONLY_SLUG) {
    const since = new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString();
    const { data } = await db.from("book_sources").select("external_id").eq("source", "hilol").gte("last_seen_at", since);
    const fresh = new Set((data ?? []).map((r) => r.external_id as string));
    slugs = slugs.filter((s) => !fresh.has(s));
  }
  slugs = slugs.slice(0, cli.limit);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  await runPool(slugs, CONCURRENCY, DELAY_MS, async (slug) => {
    const html = await fetchText(`${BASE}/${slug}`);
    if (!html) {
      failed++;
      return;
    }
    const parsed = parseHilolPage(html, slug);
    if (!parsed) {
      skipped++;
      return;
    }
    if (DRY_RUN) {
      ok++;
      console.log(JSON.stringify(parsed));
      return;
    }
    try {
      await saveHilol(db!, parsed);
      ok++;
    } catch (err) {
      failed++;
      console.warn(`  ✗ ${slug}: ${(err as Error).message}`);
    }
  });

  console.log(`Tayyor: ${ok} ta, ${skipped} ta oʻtkazildi, ${failed} ta xato`);
  checkHealth("Hilol", { listed, attempted: slugs.length, ok, failed });
}

if (process.argv[1]?.endsWith("import-hilol.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
