// Katalog matnlarini tozalash: apostrof turlari, nomdagi doʻkon izlari, Mutolaa slug'idagi apostrof izi.
// Bazadagi mavjud yozuvlar uchun xuddi shu qoidalarning SQL nusxasi —
// supabase/migrations/20261116000019_catalog_cleanup.sql (ikkalasi bir xil natija berishi shart).

import { slugify, uzNormalize } from "@/lib/text/normalize";

// Manbalarda uchraydigan apostrof turlari: ʻ ʼ ‘ ’ ` ´ '
const AP = "ʻʼ‘’`´'";
const HOLD = "\u0001";
const OPENING_QUOTE = new RegExp(`(^|[^A-Za-z0-9${AP}])[${AP}][A-Za-z]`);

// Oʻzbek lotin yozuvi: oʻ va gʻ — ʻ (U+02BB), tutuq belgisi — ʼ (U+02BC).
// Faqat soʻz ichidagi belgi almashtiriladi; qoʻshtirnoq sifatida ishlatilgan tirnoqlarga tegilmaydi.
// Faqat oʻzbek tilidagi matnga qoʻllang (inglizcha "King's" kabi nomlar uchun emas).
export function normalizeApostrophes(text: string): string {
  let s = text
    // O'Konnor, O'Genri — ism ichidagi apostrof, oʻ emas
    .replace(new RegExp(`(^|[^A-Za-z${AP}])O[${AP}](?=[A-Z][a-z])`, "g"), `$1O${HOLD}`)
    // inglizcha egalik qoʻshimchasi: King's
    .replace(new RegExp(`([Gg])[${AP}](?=s(?:[^A-Za-z]|$))`, "g"), `$1${HOLD}`)
    .replace(new RegExp(`([OoGg])[${AP}](?=[A-Za-z])`, "g"), "$1ʻ");
  // soʻz oxiridagi gʻ (togʻ, bogʻ) — matnda tirnoqli qoʻshtirnoq boʻlmasa (aks holda yopuvchi tirnoq boʻlishi mumkin)
  if (!OPENING_QUOTE.test(text)) s = s.replace(new RegExp(`([Gg])[${AP}]`, "g"), "$1ʻ");
  return s
    .replace(new RegExp(`([A-FH-NP-Za-fh-np-z])[${AP}](?=[A-Za-z])`, "g"), "$1ʼ")
    .replaceAll(HOLD, "ʼ");
}

// Mutolaa 2026-yil noyabrda yangi lotin alifbosiga oʻtdi: ö, ğ, ş, ç ("Ötkan kunlar", "Şarq").
// Saytda amaldagi yozuv saqlanadi: oʻ, gʻ, sh, ch — aks holda nomlar, qidiruv va manzillar buziladi.
const NEW_LATIN: Record<string, string> = { ö: "oʻ", Ö: "Oʻ", ğ: "gʻ", Ğ: "Gʻ", ş: "sh", Ş: "Sh", ç: "ch", Ç: "Ch" };
const isUpper = (ch: string) => ch !== ch.toLowerCase();
const isLetter = (ch: string) => ch.toLowerCase() !== ch.toUpperCase();

export function classicUzbekLatin(text: string): string {
  return text.normalize("NFC").replace(/[öÖğĞşŞçÇ]/g, (ch, at: number, all: string) => {
    const out = NEW_LATIN[ch];
    if (ch !== "Ş" && ch !== "Ç") return out;
    // "ŞARQ" -> "SHARQ", "Şarq" -> "Sharq"
    const next = all[at + 1] ?? "";
    const near = isLetter(next) ? next : (all[at - 1] ?? "");
    return isLetter(near) && isUpper(near) ? out.toUpperCase() : out;
  });
}

// Doʻkonlar kitob nomiga qavs ichida qoʻshib yuboradigan izohlar (uzNormalize koʻrinishida):
// muqova turi, "used" va jadvalimizda boʻlmagan nashriyot nomlari.
// Oʻlcham (A5), yozuv (lotin/kirill), jild va til izohlari qoladi — ular nashrni farqlaydi.
export const STATIC_TITLE_NOISE = [
  "used",
  "original",
  "premium sifat",
  "yumshoq muqova",
  "qattiq muqova",
  "yumshoq",
  "qattiq",
  "fleksibl muqova",
  "super muqova",
  "soft cover",
  "soft",
  "hard cover",
  "hardcover",
  "hard",
  "myagkaya",
  "myakgaya",
  "myagkiy",
  "myagkie",
  "myagkiy pereplyot",
  "myagkiy pereplet",
  "tverdaya",
  "tvyordiy",
  "tverdiy",
  "tvyordiy pereplyot",
  "tvyordiy pereplet",
  "tverdiy pereplet",
  "asaxiy",
  "asaxiy books",
  "azbuka klassika",
  "mif",
  "turon zamin",
  "global books",
  "global book",
  "penguin",
  "penguin uk",
  "hachette",
  "palmyra classics",
  "unicornbook",
  "unicorn",
  "ekmo",
  "act",
  "kapo",
  "bloomsbury",
  "alpina pablisher",
  "clever media",
  "collins classics",
  "harper collins",
  "harpercollins",
  "yangi asr",
];

// Doimiy roʻyxat + nashriyot nomlari (jadvaldagi name va slug) — cleanTitle uchun
export function titleNoise(publishers: Iterable<string> = []): Set<string> {
  const noise = new Set(STATIC_TITLE_NOISE);
  for (const p of publishers) {
    const key = uzNormalize(p);
    if (key) noise.add(key);
  }
  return noise;
}

const DEFAULT_NOISE = titleNoise();

// "Besh bolali yigitcha (Global books)" -> "Besh bolali yigitcha"; "Sarmoyador [Asaxiy]" -> "Sarmoyador".
// Qavs ichidagi matn shovqin roʻyxatida boʻlsagina olib tashlanadi; nom boʻsh qolsa — asl holicha qaytadi.
export function cleanTitle(title: string, noise: ReadonlySet<string> = DEFAULT_NOISE): string {
  let removed = false;
  const stripped = title.replace(/ *[(\[]([^()\[\]]*)[)\]]/g, (group, inner: string) => {
    if (!noise.has(uzNormalize(inner))) return group;
    removed = true;
    return "";
  });
  if (!removed) return title;
  const cleaned = stripped
    .replace(/ {2,}/g, " ")
    .replace(/^ +/, "")
    .replace(/[ ,;:–—-]+$/, "");
  return cleaned || title;
}

// Mutolaa slug'ida apostrof oʻrnida chiziqcha qoladi: "o-tkan-kunlar" (Oʻtkan kunlar), "she-rlar-31" (Sheʼrlar).
// Slug nomdan yasalgan boʻlsa — chiziqchalar tozalanadi, Mutolaa qoʻshgan dum ("-31") saqlanadi; aks holda oʻzgarmaydi.
export function cleanMutolaaSlug(mutolaaSlug: string, title: string): string {
  const base = slugify(title);
  const letters = base.replace(/-/g, "");
  if (!base || base === mutolaaSlug || letters.length > 250) return mutolaaSlug;
  if (!mutolaaSlug.replace(/-/g, "").startsWith(letters)) return mutolaaSlug;
  const head = mutolaaSlug.match(new RegExp(`^(?:-*[a-z0-9]){${letters.length}}`));
  if (!head) return mutolaaSlug;
  const tail = mutolaaSlug.slice(head[0].length);
  return tail === "" || tail.startsWith("-") ? base + tail : mutolaaSlug;
}

// Doʻkon sahifasidagi xato yil: "20241" (2024 + ortiqcha raqam) -> 2024; 126, 256 (sahifa soni) -> null
export function saneYear(year: number | null | undefined, now = new Date()): number | null {
  if (year == null || !Number.isInteger(year)) return null;
  const max = now.getFullYear() + 1;
  if (year >= 1400 && year <= max) return year;
  const head = Math.floor(year / 10);
  return year >= 10000 && year <= 99999 && head >= 1900 && head <= max ? head : null;
}
