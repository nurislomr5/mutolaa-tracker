import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasCleanTitle, isCyrillic, orderPublishers, pickDiverse, uniqueByTitle } from "@/lib/showcase";
import {
  classicUzbekLatin,
  cleanMutolaaSlug,
  cleanTitle,
  normalizeApostrophes,
  saneYear,
  STATIC_TITLE_NOISE,
  titleNoise,
} from "@/lib/text/clean";
import { slugify, uzNormalize } from "@/lib/text/normalize";
import { latinToCyrillic } from "@/lib/translit";

describe("uzNormalize (SQL uz_normalize bilan bir xil boʻlishi shart)", () => {
  it("lotin, kirill va apostrof turlaridan qatʼi nazar bir xil natija", () => {
    const variants = ["Oʻtkan kunlar", "O‘tkan kunlar", "O'tkan kunlar", "Ўткан кунлар", "  OʼTKAN   KUNLAR! "];
    for (const v of variants) expect(uzNormalize(v)).toBe("otkan kunlar");
  });

  it("kirill harflari", () => {
    expect(uzNormalize("Ер юзи")).toBe("yer yuzi");
    expect(uzNormalize("Шайх Ғафур Ғулом")).toBe("shayx gafur gulom");
    expect(uzNormalize("Ҳаёт")).toBe("hayot");
  });

  it("boʻsh qiymatlar", () => {
    expect(uzNormalize(null)).toBe("");
    expect(uzNormalize(undefined)).toBe("");
  });

  it("slug", () => {
    expect(slugify("Atom odatlar")).toBe("atom-odatlar");
    expect(slugify("Mehrobdan chayon (2-nashr)")).toBe("mehrobdan-chayon-2-nashr");
  });
});

describe("latinToCyrillic", () => {
  it.each([
    ["Oʻtkan kunlar", "Ўткан кунлар"],
    ["yoʻq", "йўқ"],
    ["Shayx", "Шайх"],
    ["ekran", "экран"],
    ["maʼlumot", "маълумот"],
    ["Choʻlpon", "Чўлпон"],
    ["yangi", "янги"],
    ["Kitoblar", "Китоблар"],
  ])("%s -> %s", (latin, cyr) => {
    expect(latinToCyrillic(latin)).toBe(cyr);
  });

  it("havola, email va @username oʻgirilmaydi", () => {
    expect(latinToCyrillic("https://mutolaa.com")).toBe("https://mutolaa.com");
    expect(latinToCyrillic("@sahifa_bot")).toBe("@sahifa_bot");
    expect(latinToCyrillic("Yozing: info@sahifa.uz")).toBe("Ёзинг: info@sahifa.uz");
  });

  it("lotin harfi boʻlmasa oʻzgarmaydi", () => {
    expect(latinToCyrillic("2026 — 150")).toBe("2026 — 150");
  });
});

describe("normalizeApostrophes", () => {
  it.each([
    ["O'tkan kunlar", "Oʻtkan kunlar"],
    ["G‘afur G`ulom", "Gʻafur Gʻulom"],
    ["Cho’lpon", "Choʻlpon"],
    ["tog' va bog'", "togʻ va bogʻ"],
    ["She'rlar", "Sheʼrlar"],
    ["Ma’naviyat va ma‘rifat", "Maʼnaviyat va maʼrifat"],
    ["Oʻtkan kunlar", "Oʻtkan kunlar"],
    ["O'Genri hikoyalari", "OʼGenri hikoyalari"],
    ["King's Landing", "Kingʼs Landing"],
  ])("%s -> %s", (raw, fixed) => {
    expect(normalizeApostrophes(raw)).toBe(fixed);
    expect(normalizeApostrophes(fixed)).toBe(fixed);
  });

  it("qoʻshtirnoq sifatida ishlatilgan tirnoqqa tegmaydi", () => {
    expect(normalizeApostrophes("'Alpomish' dostoni")).toBe("'Alpomish' dostoni");
    expect(normalizeApostrophes("'Bog' kitobi")).toBe("'Bog' kitobi");
  });

  it("kirill matn oʻzgarmaydi", () => {
    expect(normalizeApostrophes("Ўткан кунлар («Шарқ»)")).toBe("Ўткан кунлар («Шарқ»)");
  });
});

describe("cleanTitle", () => {
  it("qavs ichidagi doʻkon izini olib tashlaydi", () => {
    expect(cleanTitle("Besh bolali yigitcha (Global books)")).toBe("Besh bolali yigitcha");
    expect(cleanTitle("Sarmoyador [Asaxiy]")).toBe("Sarmoyador");
    expect(cleanTitle("Kichkina shahzoda (Yumshoq muqova) 2-nashr")).toBe("Kichkina shahzoda 2-nashr");
    expect(cleanTitle("Война и мир (мягкая) (Used)")).toBe("Война и мир");
  });

  it("nashrni farqlaydigan izohlar qoladi", () => {
    for (const title of ["Hikmatlar (A5)", "Сийрати набавия (1-жуз)", "Virtual olam bolalari (lotincha)", "Oʻtkan kunlar"]) {
      expect(cleanTitle(title)).toBe(title);
    }
  });

  it("nashriyot nomi — faqat roʻyxatda boʻlsa", () => {
    const title = "Ikki eshik orasi (Yangi asr avlodi)";
    expect(cleanTitle(title)).toBe(title);
    expect(cleanTitle(title, titleNoise(["Yangi asr avlodi"]))).toBe("Ikki eshik orasi");
    expect(cleanTitle("Ikki eshik orasi (yangi-asr-avlodi)", titleNoise(["yangi-asr-avlodi"]))).toBe("Ikki eshik orasi");
  });

  it("nom boʻsh qolsa — asl holicha", () => {
    expect(cleanTitle("(Used)")).toBe("(Used)");
  });

  it("doimiy roʻyxat migratsiyadagi (20261116000019) bilan bir xil", () => {
    const sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261116000019_catalog_cleanup.sql"), "utf8");
    const list = sql.match(/create or replace function pg_temp\.title_noise\(\)[\s\S]*?unnest\(array\[([\s\S]*?)\]\)/)?.[1] ?? "";
    const inSql = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(inSql.length).toBeGreaterThan(20);
    expect(inSql).toEqual([...STATIC_TITLE_NOISE].sort());
    for (const n of STATIC_TITLE_NOISE) expect(uzNormalize(n), n).toBe(n);
  });
});

describe("classicUzbekLatin (Mutolaa'ning yangi alifbosi -> amaldagi yozuv)", () => {
  it.each([
    ["Ötkan kunlar", "Oʻtkan kunlar"],
    ["Odam böliş qiyin", "Odam boʻlish qiyin"],
    ["Ölmas Umarbekov", "Oʻlmas Umarbekov"],
    ["Sevgi kimlarni yiğlatib, kimlarni kuydirmagan", "Sevgi kimlarni yigʻlatib, kimlarni kuydirmagan"],
    ["Şarq yulduzi", "Sharq yulduzi"],
    ["ŞARQ YULDUZI", "SHARQ YULDUZI"],
    ["Çöl burguti", "Choʻl burguti"],
    ["QILIÇ", "QILICH"],
    ["Ğafur Ğulom", "Gʻafur Gʻulom"],
    ["Özbekça", "Oʻzbekcha"],
    ["Ç. Aytmatov", "Ch. Aytmatov"],
    ["ta’kidlaganidek, eʼtibor", "ta’kidlaganidek, eʼtibor"],
    ["Mehrobdan chayon", "Mehrobdan chayon"],
    ["Ўткан кунлар", "Ўткан кунлар"],
  ])("%s -> %s", (input, expected) => {
    expect(classicUzbekLatin(input)).toBe(expected);
  });

  it("ajratilgan belgi (o + ¨) ham oʻgiriladi", () => {
    expect(classicUzbekLatin("O\u0308tkan")).toBe("Oʻtkan");
  });

  it("oʻgirilgan nomdan manzil va qidiruv kaliti toʻgʻri chiqadi", () => {
    expect(slugify(classicUzbekLatin("Odam böliş qiyin"))).toBe("odam-bolish-qiyin");
    expect(cleanMutolaaSlug("o-tkan-kunlar", classicUzbekLatin("Ötkan kunlar"))).toBe("otkan-kunlar");
    expect(normalizeApostrophes(classicUzbekLatin("Ta’lim va tuyğu"))).toBe("Taʼlim va tuygʻu");
  });
});

describe("cleanMutolaaSlug", () => {
  it.each([
    ["o-tkan-kunlar", "Oʻtkan kunlar", "otkan-kunlar"],
    ["odam-bo-lish-qiyin", "Odam boʻlish qiyin", "odam-bolish-qiyin"],
    ["she-rlar-31", "Sheʼrlar", "sherlar-31"],
    ["uyg-onish-abu-ali-ibn-sino", "Uygʻonish. Abu Ali ibn Sino", "uygonish-abu-ali-ibn-sino"],
    ["otkan-kunlar", "Oʻtkan kunlar", "otkan-kunlar"],
    ["mehrobdan-chayon-2", "Mehrobdan chayon", "mehrobdan-chayon-2"],
    ["boshqa-nom", "Oʻtkan kunlar", "boshqa-nom"],
    ["o-tkan-kunlarim", "Oʻtkan kunlar", "o-tkan-kunlarim"],
  ])("%s (%s) -> %s", (slug, title, expected) => {
    expect(cleanMutolaaSlug(slug, title)).toBe(expected);
  });
});

describe("saneYear", () => {
  const now = new Date("2026-11-13T00:00:00Z");
  it.each([
    [2024, 2024],
    [1898, 1898],
    [2027, 2027],
    [20241, 2024],
    [2028, null],
    [126, null],
    [20991, null],
    [null, null],
    [undefined, null],
  ])("%s -> %s", (year, expected) => {
    expect(saneYear(year, now)).toBe(expected);
  });
});

describe("bosh sahifa vitrinasi", () => {
  it("toza nom: qavs va doʻkon izisiz", () => {
    expect(hasCleanTitle("Oʻtkan kunlar")).toBe(true);
    expect(hasCleanTitle("Сийрати набавия (1-жуз)")).toBe(false);
    expect(hasCleanTitle("Sarmoyador [Asaxiy]")).toBe(false);
    expect(hasCleanTitle("A")).toBe(false);
    expect(isCyrillic("Ўткан кунлар")).toBe(true);
    expect(isCyrillic("Oʻtkan kunlar")).toBe(false);
  });

  it("bir xil nomli nashrlardan bittasi qoladi", () => {
    const books = ["Oʻtkan kunlar", "O'tkan kunlar", "Ўткан кунлар", "Mehrobdan chayon"].map((title, id) => ({ id, title }));
    expect(uniqueByTitle(books).map((b) => b.id)).toEqual([0, 3]);
  });

  const keys = (items: { id: number; pub: string | null }[]) => items.map((i) => i.pub).join("");
  const pool = (pubs: string) => [...pubs].map((pub, id) => ({ id, pub: pub === "-" ? null : pub }));

  it("bitta nashriyotdan ketma-ket ikkitadan ortiq chiqmaydi", () => {
    // 56 ta kitobi ketma-ket turgan nashriyot vitrinani egallab olmaydi
    const picked = pickDiverse(pool("a".repeat(56) + "bcdbcdeeff"), (b) => b.pub, 12);
    expect(keys(picked)).toBe("aabcdbcdeeff");
    expect(keys(picked)).not.toMatch(/(.)\1\1/);
  });

  it("kitob yetmasa jami chegara boʻshaydi, ketma-ketlik qoidasi esa saqlanadi", () => {
    expect(keys(pickDiverse(pool("aaaabca"), (b) => b.pub, 6))).toBe("aabcaa");
    expect(keys(pickDiverse(pool("aaaa"), (b) => b.pub, 4))).toBe("aa");
    expect(pickDiverse(pool("----"), (b) => b.pub, 3).map((b) => b.id)).toEqual([0, 1, 2]);
    expect(pickDiverse([], () => "a", 5)).toEqual([]);
  });

  it("nashriyotlar: avval oʻzbek nashriyotlari", () => {
    const p = (slug: string, count: number, uzCount?: number) => ({ name: slug, slug, count, ...(uzCount == null ? {} : { uzCount }) });
    // uz_count bor (20261116000019 dan keyin): kitoblarining kamida yarmi oʻzbekcha boʻlganlar birinchi
    expect(orderPublishers([p("eksmo", 900, 9), p("akademnashr", 197, 194), p("ast", 599, 8), p("hilol-nashr", 637, 602)]).map((x) => x.slug)).toEqual([
      "hilol-nashr",
      "akademnashr",
      "eksmo",
      "ast",
    ]);
    // uz_count yoʻq (eski baza): tayyor roʻyxat boʻyicha
    expect(orderPublishers([p("eksmo", 900), p("akademnashr", 197), p("nomalum", 5), p("hilol-nashr", 637)]).map((x) => x.slug)).toEqual([
      "hilol-nashr",
      "akademnashr",
      "eksmo",
      "nomalum",
    ]);
  });
});
