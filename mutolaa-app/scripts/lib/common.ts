// Katalog importerlari uchun umumiy yordamchilar (Mutolaa, Asaxiy, …)
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// .env.local tizim muhitidagi qiymatlardan ustun turadi: kompyuterda boshqa loyihaning
// NEXT_PUBLIC_SUPABASE_URL oʻzgaruvchisi boʻlsa ham, import faqat shu ilova bazasiga yozadi.
// CI'da (.env.local yoʻq) GitHub secrets ishlatiladi.
export function loadEnv() {
  if (existsSync(".env.local")) Object.assign(process.env, parseEnv(readFileSync(".env.local", "utf8")));
}

export function createAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY kerak (yoki --dry-run)");
  console.log(`Baza: ${new URL(url).host}`);
  return createClient(url, key, { auth: { persistSession: false } });
}

// books.edited_at ustuni (migratsiya 018) bormi? Yoʻq boʻlsa import eski tartibda ishlaydi.
export async function hasEditedAt(db: SupabaseClient): Promise<boolean> {
  const { error } = await db.from("books").select("edited_at").limit(1);
  return !error;
}

export const USER_AGENT = "XatchopCatalogBot/1.0 (Uzbek book tracker; metadata only)";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url: string, attempt = 1): Promise<string | null> {
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

export function cliArgs() {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    flag: (name: string) => args.includes(`--${name}`),
    option,
    limit: option("limit") ? Number(option("limit")) : Infinity,
  };
}

// HTML ichidagi barcha JSON-LD tugunlari (@graph ochilgan holda)
export function jsonLdNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]);
      for (const d of Array.isArray(data) ? data : [data]) nodes.push(...((d["@graph"] as Record<string, unknown>[]) ?? [d]));
    } catch {
      // buzilgan blok — oʻtkazib yuboramiz
    }
  }
  return nodes;
}

export function decodeHtml(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

// Bir vaqtda `concurrency` ta ishchi, har bir elementdan keyin `delayMs` pauza (manba serverini yuklamaslik uchun)
export async function runPool<T>(items: T[], concurrency: number, delayMs: number, work: (item: T, index: number) => Promise<void>) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      await work(items[i], i);
      await sleep(delayMs);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// Manba sayt tuzilmasi oʻzgarsa importer jim "muvaffaqiyatli" tugamasin: exit 1 -> GitHub Actions yiqiladi va Telegram'ga ogohlantirish ketadi
export function checkHealth(source: string, s: { listed: number; attempted: number; ok: number; failed: number }) {
  const problems: string[] = [];
  if (s.listed === 0) problems.push("kitoblar roʻyxati boʻsh — sitemap yoki katalog tuzilmasi oʻzgargan boʻlishi mumkin");
  if (s.attempted >= 20 && s.failed / s.attempted > 0.3) problems.push(`${s.failed}/${s.attempted} ta sahifa oʻqilmadi yoki saqlanmadi`);
  if (s.attempted >= 20 && s.ok === 0) problems.push("birorta ham kitob olinmadi — sahifa tuzilmasi oʻzgargan boʻlishi mumkin");
  if (s.attempted > 0 && s.attempted < 20 && s.failed > 0 && s.ok === 0) problems.push("hamma urinish muvaffaqiyatsiz");
  if (problems.length) {
    console.error(`✗ ${source}: ${problems.join("; ")}`);
    process.exitCode = 1;
  }
}
