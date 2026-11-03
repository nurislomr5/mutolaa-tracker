/**
 * Bazadagi takroriy nashriyotlarni lib/publishers.ts qoidalari boʻyicha birlashtiradi va nomlarni toʻgʻrilaydi.
 * Qayta ishga tushirish xavfsiz (allaqachon birlashtirilganlar oʻtkazib yuboriladi).
 *
 *   npm run publishers:merge -- --dry-run   # faqat rejani koʻrsatadi
 *   npm run publishers:merge
 */
import { PUBLISHER_ALIASES, PUBLISHER_NAMES } from "../lib/publishers";
import { cliArgs, createAdmin, loadEnv } from "./lib/common";

loadEnv();
const DRY_RUN = cliArgs().flag("dry-run");
const db = createAdmin();

type Row = { id: number; name: string; slug: string };

async function bySlug(slug: string): Promise<Row | null> {
  const { data } = await db.from("publishers").select("id, name, slug").eq("slug", slug).maybeSingle();
  return data;
}

async function count(table: "books" | "book_sources", publisherId: number) {
  const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq("publisher_id", publisherId);
  return count ?? 0;
}

async function main() {
  let merged = 0;
  for (const [aliasSlug, canonSlug] of Object.entries(PUBLISHER_ALIASES)) {
    const alias = await bySlug(aliasSlug);
    if (!alias) continue;
    const canon = await bySlug(canonSlug);
    const name = PUBLISHER_NAMES[canonSlug] ?? canon?.name ?? alias.name;

    if (!canon) {
      // Asosiy nashriyot hali yoʻq — taxallus yozuvining oʻzini asosiyga aylantiramiz
      console.log(`  ↻ ${alias.name} → ${name} (slug: ${canonSlug})`);
      if (!DRY_RUN) await db.from("publishers").update({ slug: canonSlug, name }).eq("id", alias.id);
      merged++;
      continue;
    }

    const books = await count("books", alias.id);
    const sources = await count("book_sources", alias.id);
    console.log(`  ⇢ ${alias.name} → ${canon.name}: ${books} ta kitob, ${sources} ta nashr`);
    if (!DRY_RUN) {
      const a = await db.from("books").update({ publisher_id: canon.id }).eq("publisher_id", alias.id);
      const b = await db.from("book_sources").update({ publisher_id: canon.id }).eq("publisher_id", alias.id);
      if (a.error || b.error) throw new Error(`${alias.slug}: ${a.error?.message ?? b.error?.message}`);
      const d = await db.from("publishers").delete().eq("id", alias.id);
      if (d.error) throw new Error(`${alias.slug} oʻchirish: ${d.error.message}`);
    }
    merged++;
  }

  let renamed = 0;
  for (const [slug, name] of Object.entries(PUBLISHER_NAMES)) {
    const row = await bySlug(slug);
    if (!row || row.name === name) continue;
    console.log(`  ✎ ${row.name} → ${name}`);
    if (!DRY_RUN) await db.from("publishers").update({ name }).eq("id", row.id);
    renamed++;
  }

  const { count: total } = await db.from("publishers").select("id", { count: "exact", head: true });
  console.log(`${DRY_RUN ? "Reja" : "Tayyor"}: ${merged} ta birlashtirish, ${renamed} ta nom tuzatish. Nashriyotlar: ${total}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
