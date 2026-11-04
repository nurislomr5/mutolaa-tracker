import { describe, expect, it } from "vitest";
import { isbnDigits, isbnVariants, isValidIsbn10, isValidIsbn13 } from "@/lib/isbn";

describe("ISBN", () => {
  it("tire, boʻsh joy va kichik x ni tozalaydi", () => {
    expect(isbnDigits("978-9943-23-194-8")).toBe("9789943231948");
    expect(isbnDigits("0-306-40615-x")).toBe("030640615X");
  });

  it("nazorat raqamini tekshiradi", () => {
    expect(isValidIsbn13("9789943231948")).toBe(true);
    expect(isValidIsbn13("9789943231949")).toBe(false);
    expect(isValidIsbn13("1234567890123")).toBe(false); // 978/979 bilan boshlanmaydi
    expect(isValidIsbn10("0306406152")).toBe(true);
    expect(isValidIsbn10("0306406153")).toBe(false);
    expect(isValidIsbn10("080442957X")).toBe(true);
  });

  it("ISBN-13 va ISBN-10 koʻrinishlarini qaytaradi", () => {
    expect(isbnVariants("978-0-306-40615-7")).toEqual(["9780306406157", "0306406152"]);
    expect(isbnVariants("0306406152")).toEqual(["9780306406157", "0306406152"]);
    // 979 — ISBN-10 koʻrinishi yoʻq
    expect(isbnVariants("9791034304011")).toEqual(["9791034304011"]);
  });

  it("notoʻgʻri qiymatga null", () => {
    expect(isbnVariants("")).toBeNull();
    expect(isbnVariants("4600000000000")).toBeNull(); // oddiy EAN-13 shtrix-kod, ISBN emas
    expect(isbnVariants("9789943231949")).toBeNull();
  });
});
