import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { COVER_PROXY_HOSTS, coverSource, ellipsize, fitText, shortDuration, wrapText } from "@/lib/share-image";

// Ulashiladigan rasmlar: matnni qatorlarga boʻlish, shrift oʻlchamini tanlash va muqova manzili.
// Chizishning oʻzi brauzerda (canvas) — bu yerda faqat sof hisob-kitob tekshiriladi.

// har bir belgi 10 px
const measure = (text: string) => [...text].length * 10;
const measureAt = (size: number) => (text: string) => [...text].length * size;

describe("wrapText", () => {
  it("soʻzlarni qator eniga sigʻdirib boʻladi", () => {
    expect(wrapText(measure, "bir ikki uch toʻrt", 90, 10)).toEqual({ lines: ["bir ikki", "uch toʻrt"], truncated: false });
  });

  it("ortiqcha boʻshliqlarni tozalaydi, abzaslarni saqlaydi", () => {
    expect(wrapText(measure, "  bir   ikki \r\n\n uch ", 200, 10).lines).toEqual(["bir ikki", "uch"]);
  });

  it("qatordan uzun soʻzni harflab boʻladi", () => {
    expect(wrapText(measure, "abcdefghijkl", 50, 10).lines).toEqual(["abcde", "fghij", "kl"]);
  });

  it("sigʻmasa — kesadi va oxiriga uch nuqta qoʻyadi", () => {
    const { lines, truncated } = wrapText(measure, "bir ikki uch toʻrt besh olti", 80, 2);
    expect(truncated).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
    expect(measure(lines[1])).toBeLessThanOrEqual(80);
  });

  it("uch nuqta oldidagi tinish belgisi olib tashlanadi", () => {
    expect(wrapText(measure, "salom, dunyo va boshqalar", 70, 1).lines).toEqual(["salom…"]);
  });

  it("boʻsh matn — qatorlar yoʻq", () => {
    expect(wrapText(measure, "   ", 100, 5)).toEqual({ lines: [], truncated: false });
  });

  it("kirill va oʻzbek harflarini buzmaydi", () => {
    expect(wrapText(measure, "Ўткан кунлар oʻgʻil", 120, 5).lines).toEqual(["Ўткан кунлар", "oʻgʻil"]);
  });
});

describe("ellipsize", () => {
  it("sigʻsa — oʻzgartirmaydi; sigʻmasa — qisqartiradi", () => {
    expect(ellipsize(measure, "qisqa", 100)).toBe("qisqa");
    const cut = ellipsize(measure, "juda uzun kitob nomi", 100);
    expect(cut.endsWith("…")).toBe(true);
    expect(measure(cut)).toBeLessThanOrEqual(100);
  });
});

describe("fitText", () => {
  const text = "bir ikki uch toʻrt besh olti yetti sakkiz";

  it("sigʻadigan eng katta oʻlchamni tanlaydi", () => {
    // 40 px: qatorga 10 ta belgi → 5 qator × 40 = 200 > 120; 20 px: 20 ta belgi → 3 qator × 20 = 60
    const fit = fitText(measureAt, text, 400, 120, [40, 20, 10], 1);
    expect(fit.size).toBe(20);
    expect(fit.truncated).toBe(false);
    expect(fit.lines.join(" ")).toBe(text);
  });

  it("qisqa matn — eng katta oʻlchamda qoladi", () => {
    expect(fitText(measureAt, "bir ikki", 400, 120, [40, 20, 10], 1).size).toBe(40);
  });

  it("hech biri sigʻmasa — eng kichik oʻlcham, kesilgan holda", () => {
    const fit = fitText(measureAt, text.repeat(20), 400, 40, [40, 20, 10], 1);
    expect(fit.size).toBe(10);
    expect(fit.truncated).toBe(true);
    expect(fit.lines.length * fit.lineHeight).toBeLessThanOrEqual(40);
  });
});

describe("shortDuration", () => {
  it("bir soatgacha — daqiqalar; undan koʻp — yaxlit soatlar", () => {
    expect(shortDuration(0)).toBeNull();
    expect(shortDuration(45)).toBe("45 daqiqa");
    expect(shortDuration(60)).toBe("1 soat");
    expect(shortDuration(1930)).toBe("32 soat");
    expect(shortDuration(1950)).toBe("33 soat");
  });
});

describe("coverSource", () => {
  it("muqova yoʻq yoki manzil yaroqsiz — null", () => {
    expect(coverSource(null)).toBeNull();
    expect(coverSource("")).toBeNull();
    expect(coverSource("rasm emas")).toBeNull();
    expect(coverSource("http://cdn-minio.mutolaa.com/media/a.jpg")).toBeNull();
    expect(coverSource("javascript:alert(1)")).toBeNull();
    expect(coverSource("//evil.example/a.jpg")).toBeNull();
  });

  it("CORS bermaydigan manbalar oʻz serverimiz orqali olinadi", () => {
    const url = "https://cdn-minio.mutolaa.com/media/books/2024/11/chalg%CA%BBituvchi.jpg";
    expect(coverSource(url)).toEqual({ src: `/_next/image?url=${encodeURIComponent(url)}&w=384&q=75`, cors: false });
    expect(coverSource("https://assets.asaxiy.uz/product/main_image/desktop/a.png.webp")?.src.startsWith("/_next/image?url=")).toBe(true);
    expect(coverSource("https://hilolnashr.uz/image/cache/catalog/a.jpg")?.cors).toBe(false);
  });

  it("foydalanuvchi yuklagan muqova (Supabase Storage) — toʻgʻridan-toʻgʻri, CORS bilan", () => {
    const url = "https://loilpsnetdmnkcnxbgvf.supabase.co/storage/v1/object/public/covers/u/b.webp";
    expect(coverSource(url)).toEqual({ src: url, cors: true });
  });

  it("oʻz saytimizdagi rasm — oʻzgarishsiz", () => {
    expect(coverSource("/icons/icon-192.png")).toEqual({ src: "/icons/icon-192.png", cors: false });
  });

  it("proksi roʻyxati next.config.ts dagi ruxsat etilgan manbalar bilan bir xil", () => {
    const allowed = (nextConfig.images?.remotePatterns ?? []).map((p) => ("hostname" in p ? p.hostname : ""));
    expect([...COVER_PROXY_HOSTS].sort()).toEqual([...allowed].sort());
  });
});
