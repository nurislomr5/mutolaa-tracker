// Bosh sahifa vitrinasi uchun sof (bazasiz) qoidalar: qaysi kitob koʻrsatiladi va nashriyotlar qanday tartiblanadi.

import { cleanTitle } from "@/lib/text/clean";
import { uzNormalize } from "@/lib/text/normalize";

// Oʻzbek nashriyotlari (slug) — publisher_book_counts hali uz_count qaytarmaydigan bazada tartib uchun.
// Tartib: oʻzbekcha kitoblari soni boʻyicha (2026-yil noyabr holati).
export const UZBEK_PUBLISHERS = [
  "hilol-nashr",
  "yangi-asr-avlodi",
  "akademnashr",
  "adabiyot",
  "zabarjad-media",
  "ziyo-nashr",
  "asaxiy-books",
  "ozbekiston",
  "yoshlar-matbuoti",
  "best-book",
  "turon-zamin-ziyo",
  "munir",
  "ilm-ziyo-zakovat",
  "zukko-kitobxon",
  "matbaachi",
  "yosh-kuch",
  "gafur-gulom",
  "info-capital-books",
  "oltin-qalam",
  "global-book",
  "factor-books",
  "trust-and-support",
  "pir-nashriyoti",
  "bukhara-books",
  "qamar-media",
  "sharq",
];

type Countable = { name: string; slug: string; count: number; uzCount?: number };

// Avval oʻzbek nashriyotlari (kitoblarining kamida yarmi oʻzbekcha) — oʻzbekcha kitoblari soni boʻyicha,
// soʻng qolganlari jami kitoblari soni boʻyicha. uzCount yoʻq boʻlsa — yuqoridagi roʻyxat tartibida.
export function orderPublishers<T extends Countable>(publishers: T[]): T[] {
  const byCount = (a: T, b: T) => b.count - a.count || a.name.localeCompare(b.name);
  if (publishers.some((p) => p.uzCount != null)) {
    const uzbek = (p: T) => (p.uzCount ?? 0) > 0 && (p.uzCount ?? 0) * 2 >= p.count;
    return [...publishers].sort(
      (a, b) => Number(uzbek(b)) - Number(uzbek(a)) || (uzbek(a) ? (b.uzCount ?? 0) - (a.uzCount ?? 0) : 0) || byCount(a, b),
    );
  }
  const rank = new Map(UZBEK_PUBLISHERS.map((slug, i) => [slug, i]));
  const place = (p: T) => rank.get(p.slug) ?? Infinity;
  return [...publishers].sort((a, b) => {
    const [x, y] = [place(a), place(b)];
    return x === y ? byCount(a, b) : x - y;
  });
}

const CYRILLIC = /[Ѐ-ӿ]/;

export const isCyrillic = (text: string) => CYRILLIC.test(text);

// Vitrinaga faqat toza nomli kitob chiqadi: doʻkon izi ("(Global books)") ham, qavsli izoh ("(25x35 sm)") ham boʻlmasin
export function hasCleanTitle(title: string): boolean {
  return title.trim().length > 1 && !/[()\[\]]/.test(title) && cleanTitle(title) === title;
}

// Bir xil nomli kitoblardan (turli nashrlar) faqat birinchisi qoladi
export function uniqueByTitle<T extends { title: string }>(books: T[]): T[] {
  const seen = new Set<string>();
  return books.filter((b) => {
    const key = uzNormalize(b.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Roʻyxatdan tartibni imkon qadar saqlagan holda `limit` ta element tanlaydi:
// bitta kalitdan (nashriyot) ketma-ket `maxRun` tadan ortiq chiqmaydi va jami `maxPer` tadan oshmaydi.
// Elementlar yetmasa jami chegara bosqichma-bosqich boʻshatiladi; ketma-ketlik qoidasi esa hech qachon buzilmaydi.
// Kaliti nomaʼlum (null) elementlarga cheklov qoʻyilmaydi.
export function pickDiverse<T>(pool: readonly T[], keyOf: (item: T) => string | number | null, limit: number, maxRun = 2, maxPer = 2): T[] {
  const rest = [...pool];
  const picked: T[] = [];
  const used = new Map<string | number, number>();
  let cap = maxPer;
  while (picked.length < limit && rest.length) {
    const tail = picked.slice(-maxRun).map(keyOf);
    const blocked = tail.length === maxRun && tail[0] != null && tail.every((k) => k === tail[0]) ? tail[0] : null;
    const free = (item: T) => {
      const key = keyOf(item);
      return key == null || key !== blocked;
    };
    const index = rest.findIndex((item) => {
      const key = keyOf(item);
      return free(item) && (key == null || (used.get(key) ?? 0) < cap);
    });
    if (index < 0) {
      if (!rest.some(free)) break;
      cap++;
      continue;
    }
    const [item] = rest.splice(index, 1);
    const key = keyOf(item);
    if (key != null) used.set(key, (used.get(key) ?? 0) + 1);
    picked.push(item);
  }
  return picked;
}
