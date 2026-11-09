import { describe, expect, it } from "vitest";
import { parseAuthors } from "@/lib/book-input";
import { allowBotRate } from "@/lib/bot/handlers";
import { coverPathFromUrl, sniffImageType } from "@/lib/covers";
import { formatCount, formatDate, formatDuration } from "@/lib/format";
import { PUBLISHER_ALIASES, publisherSlug } from "@/lib/publishers";
import { safeEqual } from "@/lib/safe-equal";
import { safeNext } from "@/lib/safe-next";
import { defaultsFor } from "@/lib/shelf-ops";
import { addDays, computeStreaks, dayKey } from "@/lib/stats-utils";
import { parseHilolPage } from "@/scripts/import-hilol";

describe("safeEqual", () => {
  it("bir xil va har xil uzunlikdagi secret'larni xavfsiz solishtiradi", () => {
    expect(safeEqual("secret-token-123", "secret-token-123")).toBe(true);
    expect(safeEqual("secret-token-123", "secret-token-124")).toBe(false);
    expect(safeEqual("short", "much-longer-secret-string")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual("", "a")).toBe(false);
  });
});

describe("defaultsFor va bot rate limit", () => {
  it("kitob formatlaridan boshlangʻich birlikni tanlaydi", () => {
    expect(defaultsFor({ formats: ["paper", "audio"], page_count: 320, audio_seconds: 3600 })).toEqual({
      format: "paper",
      unit: "pages",
      total_value: 320,
    });
    expect(defaultsFor({ formats: ["ebook"], page_count: null, audio_seconds: null })).toEqual({
      format: "ebook",
      unit: "percent",
      total_value: 100,
    });
    expect(defaultsFor({ formats: ["audio"], page_count: null, audio_seconds: 3660 })).toEqual({
      format: "audio",
      unit: "minutes",
      total_value: 61,
    });
  });

  it("bot soʻrovlar sonini vaqt oynasi boʻyicha cheklaydi", () => {
    expect(allowBotRate("test:1", 2, 60_000, 1000)).toBe(true);
    expect(allowBotRate("test:1", 2, 60_000, 2000)).toBe(true);
    expect(allowBotRate("test:1", 2, 60_000, 3000)).toBe(false);
    expect(allowBotRate("test:1", 2, 60_000, 62_000)).toBe(true);
  });
});

describe("formatlash", () => {
  it("davomiylik, sana va sonlarni oʻzbekcha koʻrsatadi", () => {
    expect(formatDuration(3600)).toBe("1 soat");
    expect(formatDuration(5400)).toBe("1 soat 30 daqiqa");
    expect(formatDuration(1800)).toBe("30 daqiqa");
    expect(formatDate("2026-11-09")).toBe("09.11.2026");
    expect(formatCount(12500).replace(/\s/g, " ")).toBe("12 500");
  });
});

describe("safeNext", () => {
  it("faqat shu saytdagi yoʻllar", () => {
    expect(safeNext("/statistika?yil=2025")).toBe("/statistika?yil=2025");
    expect(safeNext("//evil.com")).toBe("/javonim");
    expect(safeNext("/\\evil.com")).toBe("/javonim");
    expect(safeNext("https://evil.com")).toBe("/javonim");
    expect(safeNext(null)).toBe("/javonim");
    expect(safeNext(undefined, "/")).toBe("/");
  });
});

describe("statistika sanalari", () => {
  it("Toshkent vaqti boʻyicha kun", () => {
    // UTC 20:00 = Toshkentda ertasi kun 01:00
    expect(dayKey("2026-11-03T20:00:00Z")).toBe("2026-11-04");
    expect(dayKey("2026-11-03T18:59:00Z")).toBe("2026-11-03");
  });

  it("oy va yil chegarasidan oʻtadi", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("streak: bugun oʻqilmagan boʻlsa kechadan sanaydi", () => {
    const days = new Set(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(computeStreaks(days, "2026-11-04").current).toBe(3);
    expect(computeStreaks(days, "2026-11-03").current).toBe(3);
    expect(computeStreaks(days, "2026-11-05").current).toBe(0);
  });

  it("eng uzun streak", () => {
    const days = new Set(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-10", "2026-10-11"]);
    const s = computeStreaks(days, "2026-10-11");
    expect(s.current).toBe(2);
    expect(s.longest).toBe(4);
  });
});

describe("muqova", () => {
  const pad = (bytes: number[]) => new Uint8Array([...bytes, ...new Array(16).fill(0)]);

  it("fayl turini baytlardan aniqlaydi", () => {
    expect(sniffImageType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(pad([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("faqat oʻz bucket'imizdagi yoʻl", () => {
    const base = "https://x.supabase.co";
    expect(coverPathFromUrl(`${base}/storage/v1/object/public/covers/u1/a.webp`, `${base}/`)).toBe("u1/a.webp");
    expect(coverPathFromUrl("https://cdn-minio.mutolaa.com/media/a.jpg", base)).toBeNull();
    expect(coverPathFromUrl(null, base)).toBeNull();
  });
});

describe("kitob formasi", () => {
  it("mualliflar roʻyxati", () => {
    expect(parseAuthors(" Abdulla Qodiriy, , Choʻlpon,Abdulla Qodiriy ")).toEqual(["Abdulla Qodiriy", "Choʻlpon"]);
  });
});

describe("nashriyot taxalluslari", () => {
  it("har bir taxallus asosiy slug'ga olib boradi va zanjir yoʻq", () => {
    for (const [alias, main] of Object.entries(PUBLISHER_ALIASES)) {
      expect(publisherSlug(alias.replace(/-/g, " "))).toBe(main);
      expect(PUBLISHER_ALIASES[main]).toBeUndefined();
    }
  });
});

describe("Hilol-Nashr sahifa parseri", () => {
  it("kitob maʼlumotlarini HTML'dan ajratib oladi", () => {
    const html = `
      <html>
        <head><meta property="og:image" content="https://kitoblardunyosi.uz/image/cache/tafsiri-hilol.jpg" /></head>
        <body>
          <h1>Tafsiri Hilol</h1>
          <table>
            <tr><td>Muallif:</td><td>Shayx Muhammad Sodiq Muhammad Yusuf</td></tr>
            <tr><td>Nashriyot:</td><td>Hilol-Nashr</td></tr>
            <tr><td>Nashr yili:</td><td>2024</td></tr>
            <tr><td>Betlar soni:</td><td>640</td></tr>
            <tr><td>Yozuv:</td><td>Kirill</td></tr>
            <tr><td>Muqova:</td><td>Qattiq</td></tr>
            <tr><td>ISBN:</td><td>978-9943-5978-1-5</td></tr>
          </table>
          <span class="price-new">85 000 so'm</span>
        </body>
      </html>
    `;
    const parsed = parseHilolPage(html, "tafsiri-hilol");
    expect(parsed).toMatchObject({
      slug: "tafsiri-hilol",
      title: "Tafsiri Hilol",
      authors: ["Shayx Muhammad Sodiq Muhammad Yusuf"],
      publisher: "Hilol-Nashr",
      published_year: 2024,
      page_count: 640,
      script: "cyrillic",
      cover_type: "Qattiq",
      isbn: "978-9943-5978-1-5",
      price: 85000,
      in_stock: true,
    });
  });
});
