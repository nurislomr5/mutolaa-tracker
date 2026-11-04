import { describe, expect, it } from "vitest";
import { parseAuthors } from "@/lib/book-input";
import { coverPathFromUrl, sniffImageType } from "@/lib/covers";
import { PUBLISHER_ALIASES, publisherSlug } from "@/lib/publishers";
import { safeNext } from "@/lib/safe-next";
import { addDays, computeStreaks, dayKey } from "@/lib/stats-utils";

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
