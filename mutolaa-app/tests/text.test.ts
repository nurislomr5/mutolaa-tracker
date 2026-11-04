import { describe, expect, it } from "vitest";
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
