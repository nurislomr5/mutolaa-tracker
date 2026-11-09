/**
 * Asaxiy.uz qogʻoz kitoblar katalogini (faqat metamaʼlumot) Supabase'ga import qilish.
 * Har bir kitob mavjud asar bilan (ISBN yoki "nom + muallif" boʻyicha) birlashtiriladi yoki yangi asar yaratiladi;
 * nashr maʼlumoti (narx, betlar soni, nashriyot, ISBN) book_sources jadvaliga yoziladi.
 *
 *   npm run import:asaxiy                         # yangi va 6 kundan eski yozuvlar
 *   npm run import:asaxiy -- --pages 2 --dry-run  # 2 ta roʻyxat sahifasi, bazaga yozmasdan
 *   npm run import:asaxiy -- --limit 50           # faqat 50 ta kitob
 *   npm run import:asaxiy -- --slug barbara-oukli-raqamlar-uchun-yaralgan-idrok
 *   npm run import:asaxiy -- --force              # hammasini qayta yuklash (narx/mavjudlikni yangilash)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PUBLISHER_NAMES, publisherSlug } from "../lib/publishers";
import { slugify, uzNormalize } from "../lib/text/normalize";
import { checkHealth, cliArgs, createAdmin, decodeHtml, fetchText, jsonLdNodes, loadEnv, runPool } from "./lib/common";

loadEnv();

const BASE = "https://asaxiy.uz";
const CONCURRENCY = 2;
const DELAY_MS = 1000;
// Haftalik importda oʻtgan haftaning yozuvlari ham qayta yangilansin (7 boʻlsa, oʻtgan safar kechroq ishlanganlari "yangi" hisoblanib oʻtkazib yuboriladi)
const FRESH_DAYS = 6;

const cli = cliArgs();
const DRY_RUN = cli.flag("dry-run");
const FORCE = cli.flag("force");
const ONLY_SLUG = cli.option("slug");
const MAX_PAGES = cli.option("pages") ? Number(cli.option("pages")) : Infinity;

// ---------- Sahifadan maʼlumot olish ----------

type Parsed = {
  slug: string;
  url: string;
  title: string;
  authors: string[];
  description: string | null;
  cover_url: string | null;
  isbn: string | null;
  page_count: number | null;
  published_year: number | null;
  publisher: string | null;
  translator: string | null;
  cover_type: string | null;
  script: "latin" | "cyrillic" | null;
  language: string | null;
  price: number | null;
  in_stock: boolean;
  characteristics: Record<string, string>;
};

function cleanCell(html: string) {
  return decodeHtml(html.replace(/<br\s*\/?>/g, ", ").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/^[\s,]+|[\s,]+$/g, "");
}

function characteristics(html: string): Record<string, string> {
  const start = html.indexOf('id="characteristics-content"');
  if (start < 0) return {};
  const block = html.slice(start, html.indexOf("</table>", start));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g)) {
    const key = cleanCell(m[1]);
    const value = cleanCell(m[2]);
    if (key && value) out[key] = value;
  }
  return out;
}

const LANGUAGES: Record<string, string> = {
  "o'zbekcha": "uz", "oʻzbekcha": "uz", "o‘zbekcha": "uz", ruscha: "ru", inglizcha: "en", turkcha: "tr",
  arabcha: "ar", qoraqalpoqcha: "kaa", qozoqcha: "kk", nemischa: "de", fransuzcha: "fr",
};

function firstInt(value: string | undefined) {
  const m = value?.match(/\d+/);
  return m ? Number(m[0]) : null;
}

// Ism yozilishidagi kichik farqlar: "Jorj Oruell" = "Jorj Oruel", "Deniyel Kiz" = "Дэниел Киз"
function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function sameName(a: string, b: string) {
  const x = uzNormalize(a);
  const y = uzNormalize(b);
  if (!x || !y) return false;
  // qisqa ismlarda ("Ali" / "Vali") faqat aniq moslik; uzunlarida har 6 harfga 1 ta farq
  const allowed = Math.floor(Math.min(x.length, y.length) / 6);
  return x === y || (allowed > 0 && editDistance(x, y) <= allowed);
}

function parseProduct(html: string, slug: string): Parsed | null {
  const product = jsonLdNodes(html).find((n) => String(n["@type"]).includes("Product")) as
    | { name?: string; image?: string; offers?: { price?: string | number; availability?: string } }
    | undefined;
  if (!product?.name) return null;
  const ch = characteristics(html);

  const isbn = ch["ISBN"]?.split(/[,\s]+/)[0]?.replace(/[^0-9Xx-]/g, "") || null;
  const listed = (ch["Muallif"] ?? "").split(/\s*,\s*/).filter(Boolean);
  // Kitob boʻlmagan mahsulotlar (toʻplamlar, aksessuarlar) — muallif ham, ISBN ham yoʻq
  if (!listed.length && !isbn) return null;

  // Nom odatda "Muallif: Nom. PREMYERA!" koʻrinishida. Nomdagi muallif "Muallif" maydoni bilan mos kelsa
  // (yozuvidan qatʼi nazar: "Mark Tven" = "Марк Твен") yoki maydon boʻsh boʻlsa — muallifni nomdan olamiz,
  // aks holda "Python: dasturlash asoslari" kabi nomlarni buzib qoʻymaslik uchun nomga tegmaymiz.
  let title = decodeHtml(product.name).trim();
  let authors = listed;
  const colon = title.indexOf(": ");
  if (colon > 0 && colon <= 80) {
    const prefix = title.slice(0, colon);
    if (!listed.length || sameName(prefix, listed.join(" "))) {
      authors = prefix.split(/\s*,\s*/).filter(Boolean);
      title = title.slice(colon + 2);
    }
  }
  title = title
    .replace(/[.!\s]*(PREMYERA|PREMERA|PREDZAKAZ|ПРЕДЗАКАЗ|ПРЕМЬЕРА|YANGILIK)!?\s*$/i, "")
    .replace(/\.\s*$/, "")
    .trim();

  const yozuv = ch["Yozuv"]?.toLowerCase() ?? "";
  const lang = ch["Til"]?.toLowerCase().split(/\s*,\s*/)[0] ?? "";
  const price = Number(product.offers?.price);

  return {
    slug,
    url: `${BASE}/product/${slug}`,
    title,
    authors,
    // JSON-LD tavsifi SEO matni ("…ni ASAXIYda arzon narxda xarid qiling"), baʼzan boshqa kitobniki — olmaymiz
    description: null,
    cover_url: typeof product.image === "string" ? product.image : null,
    isbn,
    page_count: firstInt(ch["Betlar soni"]),
    published_year: firstInt(ch["Chop etilgan yili"]),
    publisher: ch["Nashriyot"] && !/boshqa nashriyot|бошқа нашриёт/i.test(ch["Nashriyot"]) ? ch["Nashriyot"] : null,
    translator: ch["Tarjimon"] ?? null,
    cover_type: ch["Muqovasi"] ?? null,
    script: yozuv.startsWith("lotin") ? "latin" : yozuv.startsWith("kirill") ? "cyrillic" : null,
    language: lang ? (LANGUAGES[lang] ?? lang) : null,
    price: Number.isFinite(price) && price > 0 ? Math.round(price) : null,
    in_stock: /InStock|PreOrder/i.test(product.offers?.availability ?? ""),
    characteristics: ch,
  };
}

// ---------- Roʻyxat sahifalaridan URL yigʻish ----------

async function collectSlugs(): Promise<string[]> {
  if (ONLY_SLUG) return [ONLY_SLUG];
  const slugs = new Set<string>();
  const first = await fetchText(`${BASE}/product/knigi`);
  if (!first) throw new Error("Asaxiy kitoblar roʻyxati yuklanmadi");
  const lastPage = Math.max(1, ...[...first.matchAll(/\/product\/knigi\/page=(\d+)/g)].map((m) => Number(m[1])));
  const pages = Math.min(lastPage, MAX_PAGES);
  console.log(`Roʻyxat: ${pages} sahifa`);

  const addFrom = (html: string) => {
    for (const node of jsonLdNodes(html)) {
      if (node["@type"] !== "ItemList") continue;
      for (const item of (node.itemListElement as { url?: string }[]) ?? []) {
        const m = item.url?.match(/\/product\/([a-z0-9-]+)$/);
        if (m) slugs.add(m[1]);
      }
    }
  };
  addFrom(first);
  await runPool(
    Array.from({ length: pages - 1 }, (_, i) => i + 2),
    CONCURRENCY,
    DELAY_MS,
    async (page) => {
      const html = await fetchText(`${BASE}/product/knigi/page=${page}`);
      if (html) addFrom(html);
      if (page % 50 === 0) console.log(`  roʻyxat: ${page}/${pages} (${slugs.size} ta kitob)`);
    },
  );
  return [...slugs];
}

// ---------- Bazaga yozish ----------

class Saver {
  private publishers = new Map<string, number>();
  private usedSlugs = new Set<string>();
  stats = { matched: 0, created: 0 };

  constructor(private db: SupabaseClient) {}

  async init() {
    const { data } = await this.db.from("publishers").select("id, slug");
    for (const p of data ?? []) this.publishers.set(p.slug, p.id);
  }

  // Taxalluslar (lib/publishers.ts) asosiy nashriyotga bogʻlanadi: "\"Sharq\" NMAK" -> Sharq
  private async publisherId(name: string | null) {
    if (!name) return null;
    const slug = publisherSlug(name);
    if (!slug) return null;
    const cached = this.publishers.get(slug);
    if (cached) return cached;
    const { data, error } = await this.db
      .from("publishers")
      .upsert({ name: PUBLISHER_NAMES[slug] ?? name, slug }, { onConflict: "slug" })
      .select("id")
      .single();
    if (error) throw new Error(`publishers: ${error.message}`);
    this.publishers.set(slug, data.id);
    return data.id as number;
  }

  // Mavjud asarni topish: oldingi import -> ISBN -> "nom + muallif" -> nom + muallif ichida
  private async findBook(p: Parsed): Promise<number | null> {
    const { data: prev } = await this.db.from("book_sources").select("book_id").eq("source", "asaxiy").eq("external_id", p.slug).maybeSingle();
    if (prev) return prev.book_id;

    if (p.isbn) {
      const { data: byIsbn } = await this.db.from("book_sources").select("book_id").eq("isbn", p.isbn).limit(1);
      if (byIsbn?.length) return byIsbn[0].book_id;
      const { data: bookIsbn } = await this.db.from("books").select("id").eq("isbn", p.isbn).limit(1);
      if (bookIsbn?.length) return bookIsbn[0].id;
    }

    const authorText = p.authors.join(", ");
    const key = uzNormalize(`${p.title} ${authorText}`);
    const { data: exact } = await this.db.from("books").select("id").eq("search_text", key).limit(1);
    if (exact?.length) return exact[0].id;

    // Mutolaa'da nom yonida qoʻshimcha muallif boʻlishi mumkin: "nom" bilan boshlanib, muallifni oʻz ichiga olgan yagona asar
    const normTitle = uzNormalize(p.title);
    const normAuthor = uzNormalize(p.authors[0] ?? "");
    if (normTitle.length >= 4 && normAuthor) {
      const { data: candidates } = await this.db.from("books").select("id, search_text").like("search_text", `${normTitle} %`).limit(5);
      const hits = (candidates ?? []).filter((c) => c.search_text.slice(normTitle.length).includes(normAuthor));
      if (hits.length === 1) return hits[0].id;
    }
    return null;
  }

  private async uniqueSlug(base: string) {
    let slug = base || "kitob";
    for (let i = 2; ; i++) {
      if (!this.usedSlugs.has(slug)) {
        const { data } = await this.db.from("books").select("id").eq("slug", slug).maybeSingle();
        if (!data) break;
      }
      slug = `${base}-${i}`;
    }
    this.usedSlugs.add(slug);
    return slug;
  }

  private async linkAuthors(bookId: number, names: string[]) {
    if (!names.length) return;
    const rows = names.map((name) => ({ name, slug: slugify(name) })).filter((r) => r.slug);
    // mavjud mualliflarni (Mutolaa'dan) qayta yozmaymiz
    await this.db.from("authors").upsert(rows, { onConflict: "slug", ignoreDuplicates: true });
    const { data } = await this.db.from("authors").select("id, slug").in("slug", rows.map((r) => r.slug));
    const ids = new Map((data ?? []).map((a) => [a.slug, a.id]));
    const links = rows.map((r, i) => ({ book_id: bookId, author_id: ids.get(r.slug), position: i })).filter((l) => l.author_id);
    if (links.length) await this.db.from("book_authors").upsert(links, { onConflict: "book_id,author_id", ignoreDuplicates: true });
  }

  async save(p: Parsed) {
    const publisherId = await this.publisherId(p.publisher);
    let bookId = await this.findBook(p);

    if (bookId) {
      // Mavjud asarni qogʻoz nashr maʼlumoti bilan boyitamiz (boʻsh maydonlarnigina toʻldiramiz)
      const { data: book } = await this.db
        .from("books")
        .select("formats, isbn, page_count, publisher_id, published_year, script, translator, cover_url, description")
        .eq("id", bookId)
        .single();
      const patch: Record<string, unknown> = {};
      if (book && !book.formats.includes("paper")) patch.formats = [...book.formats, "paper"];
      const fill = { isbn: p.isbn, page_count: p.page_count, publisher_id: publisherId, published_year: p.published_year, script: p.script, translator: p.translator, cover_url: p.cover_url, description: p.description };
      for (const [k, v] of Object.entries(fill)) if (v != null && book && book[k as keyof typeof book] == null) patch[k] = v;
      if (Object.keys(patch).length) await this.db.from("books").update(patch).eq("id", bookId);
      this.stats.matched++;
    } else {
      const slug = await this.uniqueSlug(slugify(`${p.title} ${p.authors[0] ?? ""}`));
      const { data, error } = await this.db
        .from("books")
        .insert({
          slug,
          title: p.title,
          author_names: p.authors.join(", ") || null,
          description: p.description,
          cover_url: p.cover_url,
          formats: ["paper"],
          isbn: p.isbn,
          page_count: p.page_count,
          publisher_id: publisherId,
          published_year: p.published_year,
          script: p.script,
          translator: p.translator,
          language: p.language,
          source: "asaxiy",
          source_url: p.url,
          imported_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw new Error(`books insert (${p.slug}): ${error.message}`);
      bookId = data.id as number;
      await this.linkAuthors(bookId, p.authors);
      this.stats.created++;
    }

    const { error } = await this.db.from("book_sources").upsert(
      {
        book_id: bookId,
        source: "asaxiy",
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
        raw: { title: p.title, characteristics: p.characteristics },
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "source,external_id" },
    );
    if (error) throw new Error(`book_sources (${p.slug}): ${error.message}`);
  }
}

async function freshSlugs(db: SupabaseClient) {
  const since = new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString();
  const fresh = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("book_sources")
      .select("external_id")
      .eq("source", "asaxiy")
      .gte("last_seen_at", since)
      .range(from, from + 999);
    if (error) throw new Error(`book_sources: ${error.message}`);
    for (const r of data ?? []) fresh.add(r.external_id);
    if (!data || data.length < 1000) break;
  }
  return fresh;
}

async function main() {
  const db = DRY_RUN ? null : createAdmin();
  let slugs = await collectSlugs();
  const listed = slugs.length;
  console.log(`Asaxiy: ${slugs.length} ta mahsulot`);
  if (db && !FORCE && !ONLY_SLUG) {
    const fresh = await freshSlugs(db);
    slugs = slugs.filter((s) => !fresh.has(s));
    console.log(`Oxirgi ${FRESH_DAYS} kunda yangilanganlar oʻtkazib yuborildi: ${fresh.size}`);
  }
  slugs = slugs.slice(0, cli.limit);
  console.log(`Yuklanadi: ${slugs.length} ta`);

  const saver = db ? new Saver(db) : null;
  await saver?.init();
  // Bir asarning ikki nashri bir vaqtda yaratilib qolmasligi uchun bazaga yozish ketma-ket
  let queue = Promise.resolve();
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const startedAt = Date.now();

  await runPool(slugs, CONCURRENCY, DELAY_MS, async (slug, i) => {
    const html = await fetchText(`${BASE}/product/${slug}`);
    const parsed = html ? parseProduct(html, slug) : null;
    if (!html) failed++;
    else if (!parsed) skipped++;
    else if (DRY_RUN) {
      ok++;
      console.log(JSON.stringify({ ...parsed, characteristics: undefined, description: parsed.description?.slice(0, 50) }));
    } else {
      queue = queue.then(() =>
        saver!.save(parsed).then(
          () => void ok++,
          (err) => {
            failed++;
            console.warn(`  ✗ ${slug}: ${(err as Error).message}`);
          },
        ),
      );
      await queue;
    }
    if ((i + 1) % 100 === 0) {
      const rate = (i + 1) / ((Date.now() - startedAt) / 1000);
      console.log(`  ✓ ${i + 1}/${slugs.length} (${Math.round((slugs.length - i - 1) / rate / 60)} daq qoldi)`);
    }
  });
  await queue;

  console.log(
    `Tayyor: ${ok} ta ${DRY_RUN ? "oʻqildi" : "saqlandi"}` +
      (saver ? ` (${saver.stats.matched} ta mavjud asarga qoʻshildi, ${saver.stats.created} ta yangi)` : "") +
      `, ${skipped} ta kitob emas, ${failed} ta xato, ${Math.round((Date.now() - startedAt) / 1000)} s`,
  );
  checkHealth("Asaxiy", { listed, attempted: slugs.length, ok, failed });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
