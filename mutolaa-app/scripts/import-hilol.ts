/**
 * Hilol-Nashr (hilolnashr.uz, avval kitoblardunyosi.uz) qogʻoz kitoblar katalogini (faqat metamaʼlumot) Supabase'ga import qilish.
 * Har bir kitob mavjud asar bilan (ISBN yoki "nom + muallif" boʻyicha) birlashtiriladi va
 * nashr maʼlumoti (narx, sotuvda borligi, betlar soni, nashriyot, ISBN) book_sources jadvaliga (source = 'hilol') yoziladi.
 * Jurnallar va ISBN ham, muallif ham koʻrsatilmagan mahsulotlar (disk, plakat…) oʻtkazib yuboriladi.
 *
 *   npm run import:hilol                          # yangi va 7 kundan eski yozuvlar
 *   npm run import:hilol -- --dry-run             # bazaga yozmasdan: nima qoʻshilishi/birlashishini koʻrsatadi
 *   npm run import:hilol -- --dry-run --limit 20  # faqat 20 ta kitob
 *   npm run import:hilol -- --slug Xayola-hn      # bitta kitob
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { findBookByIsbn } from "../lib/isbn-lookup";
import { PUBLISHER_NAMES, publisherSlug } from "../lib/publishers";
import { slugify, uzNormalize } from "../lib/text/normalize";
import { checkHealth, cliArgs, createAdmin, decodeHtml, fetchText, loadEnv, runPool } from "./lib/common";

loadEnv();

const BASE = "https://hilolnashr.uz";
const CATEGORY = `${BASE}/hilol-nashr`;
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
  translator: string | null;
  cover_url: string | null;
  isbn: string | null;
  page_count: number | null;
  published_year: number | null;
  publisher: string | null;
  cover_type: string | null;
  script: "latin" | "cyrillic";
  language: string;
  price: number | null;
  in_stock: boolean;
};

const clean = (s: string) =>
  decodeHtml(s)
    .replace(/[‎‏ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Tavsifdagi maʼlum yorliqlar — baʼzi sahifalarda ular orasida qator tashlanmagan ("Ёрқинжон ФозилНашриёт: …Сана: 2022")
const KNOWN_LABELS =
  /(муаллифлар|муаллиф|таржимон|нашриёт|сана|ҳажми|хажми|isbn|ўлчами|бичими|муқоваси|номи|mualliflar|muallif|tarjimon|nashriyot|sana|hajmi|o.?lchami|bichimi|muqovasi|nomi)\s*:/gi;

// Kitob tavsifidagi "Yorliq: qiymat" qatorlari (kirill va lotin yorliqlar) — kalit kichik harfda
function descriptionFields(html: string) {
  const start = html.indexOf('<div class="block-content expand-content">');
  if (start < 0) return new Map<string, string>();
  const text = decodeHtml(
    html
      .slice(start, start + 40_000)
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>|<\/(?:p|div|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  ).replace(KNOWN_LABELS, "\n$1:");
  const fields = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([^:\n]{2,30}?)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const key = clean(m[1]).toLowerCase();
    // qiymat ichida yorliq takrorlangan boʻlishi mumkin: "Ўлчами: Ўлчами: 14х21 см"
    let value = clean(m[2]);
    if (value.toLowerCase().startsWith(`${key}:`)) value = value.slice(key.length + 1).trim();
    if (value && !fields.has(key)) fields.set(key, value);
  }
  return fields;
}

const field = (fields: Map<string, string>, ...keys: string[]) => {
  for (const k of keys) {
    const v = fields.get(k);
    if (v) return v;
  }
  return null;
};

// "«Hilol-Nashr» нашриёт-матбааси", "HILOL NASHR", "Нilol" (kirill Н) → "Hilol-Nashr"; boshqa nashriyotlar — qoʻshtirnoqsiz
export function cleanPublisher(raw: string | null) {
  if (!raw) return null;
  const name = raw
    .replace(/[«»"“”„]/g, "")
    .replace(/\s+(?:нашриёт\S*|nashriyot\S*|mchj|мчж)\s*$/i, "")
    .trim();
  // "Hilol", "Ҳилол-Нашр", "Hilol Nahsr", "Hlol", "Нilol" (kirill Н) — barchasi bitta nashriyot; "Hilol media" — boshqa
  if (/^[hn]i?lol(?!media)/.test(uzNormalize(name).replace(/[^a-z]/g, ""))) return "Hilol-Nashr";
  return name || null;
}

// Bir asarning turli nashrlarini (kirill/lotin, yumshoq/sovgʻabop muqova) bogʻlash uchun kalit:
// qavs ichidagi izoh olib tashlanadi, lekin raqamli izoh qoladi — "(1-жуз)" va "(2-жуз)" alohida kitoblar
export function workKey(title: string) {
  const t = title.replace(/\(([^)]*)\)/g, (_, inner: string) => (/\d/.test(inner) ? ` ${inner} ` : " "));
  return uzNormalize(t).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// Plakat, banner, audio disk — kitob emas (ISBN yoki muallif koʻrsatilgan boʻlsa ham)
const NOT_A_BOOK = /плакат|plakat|banner|баннер|(?:^|[\s-])диск|(?:^|[\s-])disk\b|\bmp3\b|мр3/i;

// Sarlavha boshidagi «…» qoʻshtirnoqlarni olib tashlaymiz: «Хаёла» → Хаёла, «Сийрати набавия» (1-жуз) → Сийрати набавия (1-жуз)
function cleanTitle(raw: string) {
  return raw.replace(/^«([^»]+)»\s*/, "$1 ").trim();
}

// Til: slug oxiridagi belgi (-qz, -qr, -rus) yoki nomdagi izoh; qozoq/qoraqalpoq nashrlari nomida "рус" ham uchraydi
export function guessLanguage(slug: string, title: string) {
  const sl = slug.toLowerCase();
  const t = title.toLowerCase();
  if (/-(?:qz|kz)$/.test(sl) || /қозоқ|qozoq|қазақ/.test(t)) return "kk";
  if (/-qr$/.test(sl) || /қорақалпоқ|qoraqalpoq/.test(t)) return "kaa";
  if (/arabic/.test(sl) || /\(arabic\)|араб тилида|arab tilida/.test(t)) return "ar";
  if (/-(?:rus|ru)$/.test(sl) || /рус тилида|rus tilida/.test(t)) return "ru";
  return "uz";
}

const AUTHOR_KEYS = ["муаллиф", "муаллифлар", "muallif", "mualliflar", "тузувчи", "tuzuvchi"];
// "Тўплаб, нашрга тайёрловчи" kabi tuzuvchi yorliqlari (jurnallardagi "Ғоя муаллифи" emas)
const isCompilerKey = (k: string) => /тайёрловчи|tayyorlovchi|тўпловчи|to.?plovchi/.test(k);

export function parseHilolPage(html: string, slug: string): ParsedHilol | null {
  const h1 = html.match(/<h1 class="title page-title">\s*(?:<span>)?([\s\S]*?)(?:<\/span>)?\s*<\/h1>/i);
  const title = h1 ? cleanTitle(clean(h1[1].replace(/<[^>]+>/g, ""))) : "";
  if (!title || NOT_A_BOOK.test(`${title} ${slug}`)) return null;

  const fields = descriptionFields(html);
  // "Номи: «Иймон калималари» (плакат)" — sarlavhada koʻrinmagan plakat
  if (NOT_A_BOOK.test(field(fields, "номи", "nomi") ?? "")) return null;
  const rawAuthor = field(fields, ...AUTHOR_KEYS) ?? [...fields].find(([k]) => isCompilerKey(k))?.[1] ?? null;
  const authors = rawAuthor
    ? rawAuthor
        .split(/\s*[,;]\s*/)
        .map((a) => a.trim())
        .filter((a) => a.length > 1 && a.length < 80)
    : [];
  const isbnRaw = field(fields, "isbn");
  const isbn = isbnRaw?.match(/97[89][0-9\- ]{10,16}|[0-9][0-9\- ]{8,12}[0-9Xx]/)?.[0].replace(/\s+/g, "") ?? null;
  // jurnallar (ISSN), disk/plakat va boshqa kitob boʻlmagan mahsulotlar
  if (!isbn && !authors.length) return null;

  const pages = field(fields, "ҳажми", "хажми", "hajmi", "бетлар сони", "betlar soni")?.match(/(\d{2,4})\s*(?:бет|bet)/i);
  const year = field(fields, "сана", "sana", "нашр йили", "nashr yili")?.match(/\b(19\d{2}|20\d{2})\b/);

  const titleAt = h1?.index ?? 0;
  const priceMatch = html.slice(titleAt).match(/class="product-price(?:-new)?">\s*([\d\s ]+)\s*(?:сўм|so['ʻ’]?m)/i);
  const price = priceMatch ? Number(priceMatch[1].replace(/\D/g, "")) : null;
  const stock = html.match(/<li class="product-stock ([a-z-]+)"/)?.[1];

  const cover = html.match(/data-largeimg="([^"]+)"/)?.[1] ?? html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ?? null;

  return {
    slug,
    url: `${BASE}/${slug}`,
    title,
    authors,
    translator: field(fields, "таржимон", "tarjimon"),
    cover_url: cover ? decodeHtml(cover) : null,
    isbn,
    page_count: pages ? Number(pages[1]) : null,
    published_year: year ? Number(year[1]) : null,
    publisher: cleanPublisher(field(fields, "нашриёт", "nashriyot")) ?? "Hilol-Nashr",
    cover_type: field(fields, "муқоваси", "muqovasi", "муқова", "muqova"),
    script: /[а-яёўқғҳ]/i.test(title) ? "cyrillic" : "latin",
    language: guessLanguage(slug, title),
    price: price && price > 0 ? price : null,
    in_stock: stock ? stock === "in-stock" : true,
  };
}

// Kategoriya sahifasidagi asosiy roʻyxat (yon panel/karusellardagi mahsulotlarsiz).
// Havolalar "https://hilolnashr.uz/hilol-nashr/<slug>?page=…" koʻrinishida; slug katta-kichik harfga sezgir.
export function parseCategoryPage(html: string): string[] {
  const start = html.indexOf('<div class="main-products');
  if (start < 0) return [];
  const end = html.indexOf("pagination-results", start);
  const grid = html.slice(start, end > 0 ? end : undefined);
  const slugs = new Set<string>();
  for (const m of grid.matchAll(/<div class="name"><a href="https:\/\/hilolnashr\.uz\/(?:hilol-nashr\/)?([^"?#/]+)/g)) {
    const s = decodeHtml(m[1]);
    if (s !== "hilol-nashr") slugs.add(s);
  }
  return [...slugs];
}

async function collectSlugs(): Promise<string[]> {
  if (ONLY_SLUG) return [ONLY_SLUG];
  const slugs = new Set<string>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await fetchText(`${CATEGORY}?limit=100&page=${page}`);
    if (!html) break;
    const before = slugs.size;
    for (const s of parseCategoryPage(html)) slugs.add(s);
    if (slugs.size === before) break;
  }
  return [...slugs];
}

const isbnKey = (isbn: string) => isbn.toUpperCase().replace(/[^0-9X]/g, "");

type Works = Map<string, number>;

// Hilol-Nashr'ga bogʻlangan mavjud kitoblar (asosiy yozuv yoki nashr orqali): workKey(nom) -> kitob id
async function loadHilolWorks(db: SupabaseClient): Promise<Works> {
  const works: Works = new Map();
  const { data: pub } = await db.from("publishers").select("id").eq("slug", "hilol-nashr").maybeSingle();
  if (!pub) return works;
  const ids = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("books").select("id").eq("publisher_id", pub.id).range(from, from + 999);
    for (const r of data ?? []) ids.add(r.id as number);
    if (!data || data.length < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("book_sources").select("book_id").eq("publisher_id", pub.id).range(from, from + 999);
    for (const r of data ?? []) ids.add(r.book_id as number);
    if (!data || data.length < 1000) break;
  }
  const list = [...ids];
  for (let i = 0; i < list.length; i += 200) {
    const { data } = await db.from("books").select("id, title").in("id", list.slice(i, i + 200));
    for (const b of data ?? []) {
      const k = workKey(b.title as string);
      if (k && !works.has(k)) works.set(k, b.id as number);
    }
  }
  return works;
}

// Mavjud asarni topish: avval shu nashrning oldingi importi, soʻng ISBN (10/13), soʻng aniq "nom + muallif",
// soʻng Hilol kitoblari orasida qavsdagi izohsiz nom (boshqa nashri: kirill/lotin, muqova turi).
// skipIsbn: Hilol saytida bir nechta mahsulotda bir xil ISBN (nashriyot xatosi) — ular ISBN boʻyicha birlashtirilmaydi
async function findExisting(
  db: SupabaseClient,
  p: ParsedHilol,
  skipIsbn: boolean,
  works: Works,
): Promise<{ bookId: number; by: "source" | "isbn" | "title" | "work" } | null> {
  const { data: prev } = await db.from("book_sources").select("book_id").eq("source", "hilol").eq("external_id", p.slug).maybeSingle();
  if (prev) return { bookId: prev.book_id as number, by: "source" };
  if (p.isbn && !skipIsbn) {
    const found = await findBookByIsbn(db, p.isbn);
    if (found?.book) return { bookId: found.book.id, by: "isbn" };
  }
  if (p.authors.length) {
    const { data: exact } = await db.from("books").select("id").eq("search_text", uzNormalize(`${p.title} ${p.authors.join(", ")}`)).limit(1);
    if (exact?.length) return { bookId: exact[0].id as number, by: "title" };
  }
  const work = works.get(workKey(p.title));
  if (work) return { bookId: work, by: "work" };
  return null;
}

async function saveHilol(db: SupabaseClient, p: ParsedHilol, skipIsbn: boolean, works: Works) {
  const pubSlug = publisherSlug(p.publisher ?? "Hilol-Nashr");
  const { data: pubRow } = await db
    .from("publishers")
    .upsert({ name: PUBLISHER_NAMES[pubSlug] ?? p.publisher ?? "Hilol-Nashr", slug: pubSlug }, { onConflict: "slug", ignoreDuplicates: false })
    .select("id")
    .single();
  const publisherId = (pubRow?.id as number | undefined) ?? null;

  let bookId = (await findExisting(db, p, skipIsbn, works))?.bookId ?? null;
  if (!bookId) {
    const base = slugify(`${p.title} ${p.authors[0] ?? ""}`) || slugify(p.slug);
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
        translator: p.translator,
        language: p.language,
        source: "hilol",
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
      language: p.language,
      price: p.price,
      in_stock: p.in_stock,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "source,external_id" },
  );
  if (error) throw new Error(`book_sources (${p.slug}): ${error.message}`);
  // shu importdagi keyingi nashrlar (masalan, lotin yozuvidagisi) shu kitobga qoʻshilsin
  const k = workKey(p.title);
  if (k && !works.has(k)) works.set(k, bookId);
}

async function main() {
  // Sinov rejimida ham baza faqat oʻqiladi — qaysi kitob mavjud asarga qoʻshilishi, qaysi biri yangi boʻlishini koʻrsatish uchun
  const hasDb = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const db = DRY_RUN && !hasDb ? null : createAdmin();
  let slugs = await collectSlugs();
  const listed = slugs.length;
  console.log(`Hilol-Nashr: ${slugs.length} ta mahsulot${DRY_RUN ? " (sinov rejimi — bazaga yozilmaydi)" : ""}`);
  if (db && !DRY_RUN && !FORCE && !ONLY_SLUG) {
    const since = new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString();
    const { data } = await db.from("book_sources").select("external_id").eq("source", "hilol").gte("last_seen_at", since);
    const fresh = new Set((data ?? []).map((r) => r.external_id as string));
    slugs = slugs.filter((s) => !fresh.has(s));
  }
  slugs = slugs.slice(0, cli.limit);

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const plan = { source: 0, isbn: 0, title: 0, work: 0, new: 0 };

  // 1-bosqich: barcha sahifalarni oʻqish (takroriy ISBN'larni aniqlash uchun saqlashdan oldin)
  const parsed: ParsedHilol[] = [];
  await runPool(slugs, CONCURRENCY, DELAY_MS, async (slug) => {
    const html = await fetchText(`${BASE}/${encodeURI(slug)}`);
    if (!html) {
      failed++;
      return;
    }
    const p = parseHilolPage(html, slug);
    if (p) parsed.push(p);
    else skipped++;
  });

  const isbnCount = new Map<string, number>();
  for (const p of parsed) if (p.isbn) isbnCount.set(isbnKey(p.isbn), (isbnCount.get(isbnKey(p.isbn)) ?? 0) + 1);
  const duplicated = (p: ParsedHilol) => Boolean(p.isbn && (isbnCount.get(isbnKey(p.isbn)) ?? 0) > 1);
  const dupCount = parsed.filter(duplicated).length;
  if (dupCount) console.log(`⚠️ ${dupCount} ta mahsulotda ISBN takrorlangan — ular ISBN boʻyicha birlashtirilmaydi`);

  console.log(`Oʻqildi: ${parsed.length} ta kitob, ${skipped} ta kitob emas, ${failed} ta sahifa ochilmadi`);

  // 2-bosqich (ketma-ket — bir asarning nashrlari bitta kitobga tushishi uchun): sinov rejimida faqat reja
  const works: Works = db ? await loadHilolWorks(db) : new Map();
  let virtualId = 0;
  for (const p of parsed) {
    if (DRY_RUN) {
      ok++;
      const match = db ? await findExisting(db, p, duplicated(p), works) : null;
      if (db) plan[match?.by ?? "new"]++;
      // yangi kitob — keyingi nashrlari unga qoʻshilishini koʻrsatish uchun vaqtinchalik (manfiy) id
      if (db && !match && workKey(p.title)) works.set(workKey(p.title), --virtualId);
      console.log(JSON.stringify({ ...p, match: match ? `${match.by}:${match.bookId}` : db ? "yangi" : "?", isbnDuplicated: duplicated(p) }));
      continue;
    }
    try {
      await saveHilol(db!, p, duplicated(p), works);
      ok++;
    } catch (err) {
      failed++;
      console.warn(`  ✗ ${p.slug}: ${(err as Error).message}`);
    }
  }

  console.log(`Tayyor: ${ok} ta, ${skipped} ta oʻtkazildi (kitob emas), ${failed} ta xato`);
  if (DRY_RUN && db)
    console.log(
      `Reja: ${plan.isbn} ta ISBN, ${plan.title} ta nom+muallif, ${plan.work} ta boshqa nashr (nom) boʻyicha mavjud kitobga qoʻshiladi, ` +
        `${plan.source} ta avval import qilingan, ${plan.new} ta yangi kitob yaratiladi`,
    );
  checkHealth("Hilol", { listed, attempted: slugs.length, ok, failed });
}

if (process.argv[1]?.endsWith("import-hilol.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
