import { describe, expect, it } from "vitest";
import { bookInputSchema, parseAuthors } from "@/lib/book-input";
import { allowBotRate } from "@/lib/bot/handlers";
import { coverPathFromUrl, sniffImageType } from "@/lib/covers";
import { formatCount, formatDate, formatDuration } from "@/lib/format";
import { PUBLISHER_ALIASES, publisherSlug } from "@/lib/publishers";
import { safeEqual } from "@/lib/safe-equal";
import { safeNext } from "@/lib/safe-next";
import { defaultsFor } from "@/lib/shelf-ops";
import { addDays, computeStreaks, dayKey } from "@/lib/stats-utils";
import { cleanPublisher, guessLanguage, parseCategoryPage, parseHilolPage, workKey } from "@/scripts/import-hilol";

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

  it("apostrof turlari bir xillashadi", () => {
    const parsed = bookInputSchema.parse({ title: " O'tkan kunlar ", authors: "Cho’lpon, G`afur G'ulom", formats: ["paper"], description: "She'rlar to'plami" });
    expect(parsed).toMatchObject({ title: "Oʻtkan kunlar", authors: "Choʻlpon, Gʻafur Gʻulom", description: "Sheʼrlar toʻplami" });
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

describe("Hilol-Nashr (hilolnashr.uz) parseri", () => {
  // Sayt tuzilmasining qisqartirilgan nusxasi (OpenCart): sarlavha, narx, mavjudlik, tavsifdagi "Yorliq: qiymat" qatorlari
  const page = (fields: string, { stock = "in-stock", price = "39 000 сўм" } = {}) => `
    <html><head><meta property="og:image" content="https://hilolnashr.uz/image/cache/x-600x315w.jpg" /></head><body>
      <div class="product-card"><div class="product-price">999 000 сўм</div></div>
      <h1 class="title page-title"><span>«Хаёла»</span></h1>
      <div class="swiper-slide" data-largeimg="https://hilolnashr.uz/image/cache/catalog/01%20(5)-1000x1000h.jpg"></div>
      <div class="product-stats"><ul><li class="product-stock ${stock}"><b>Stock:</b> <span>…</span></li></ul></div>
      <div class="product-price-group"><div class="product-price">${price}</div></div>
      <div class="block-content expand-content"><p>Китоб ҳақида.</p>
        <p><b>Муаллиф:</b>&nbsp;Абдулкарим Ҳасан<br><b>Таржимон:</b> Жалолиддин Ҳамроқулов<br>${fields}</p>
        <script>$("input[name='rating']").val(5);</script>
      </div>
      <div class="block-content expand-content"><b>Изоҳ:</b> HTML is not translated!</div>
    </body></html>`;

  it("kitob maʼlumotlarini tavsifdagi yorliqlardan oladi", () => {
    const html = page(
      "<b>Нашриёт:</b> «Hilol-Nashr» нашриёт-матбааси‎<br><b>Ҳажми:</b> 176 бет<br><b>Сана:</b> 2026 йил (2023, 2024)<br>" +
        "<b>ISBN:</b>&nbsp;978-9910-273-91-9&nbsp;<br><b>Ўлчами:</b> Ўлчами: 14х21 см<br><b>Муқоваси:</b>&nbsp;юмшоқ",
    );
    expect(parseHilolPage(html, "Xayola-hn")).toEqual({
      slug: "Xayola-hn",
      url: "https://hilolnashr.uz/Xayola-hn",
      title: "Хаёла",
      authors: ["Абдулкарим Ҳасан"],
      translator: "Жалолиддин Ҳамроқулов",
      cover_url: "https://hilolnashr.uz/image/cache/catalog/01%20(5)-1000x1000h.jpg",
      isbn: "978-9910-273-91-9",
      page_count: 176,
      published_year: 2026,
      publisher: "Hilol-Nashr",
      cover_type: "юмшоқ",
      script: "cyrillic",
      language: "uz",
      price: 39000,
      in_stock: true,
    });
  });

  it("sotuvda yoʻq mahsulot, lotin yorliqlari va 'Хажми' xatosi", () => {
    const html = page("<b>Hajmi:</b> 208 bet<br><b>Sana:</b> 2025 yil<br><b>ISBN:</b> 978-9943-9130-4-2", { stock: "out-of-stock" });
    expect(parseHilolPage(html, "x")).toMatchObject({ page_count: 208, published_year: 2025, in_stock: false, publisher: "Hilol-Nashr" });
    expect(parseHilolPage(page("<b>Хажми:</b> 512 бет<br><b>ISBN:</b> 978-9910-619-84-7"), "y")?.page_count).toBe(512);
  });

  it("jurnal (ISSN, muallifsiz) va kitob boʻlmagan mahsulotlarni oʻtkazib yuboradi", () => {
    const journal = page("").replace(/<b>Муаллиф:<\/b>[^<]*<br>/, "<b>Ғоя муаллифи:</b> X<br>") + "<b>ISSN:</b> 3030-346X";
    expect(parseHilolPage(journal, "omina-jurnali-12-son")).toBeNull();
    expect(parseHilolPage("<html><h1 class=\"title page-title\"><span>Сиз сўраган саҳифа топилмади!</span></h1></html>", "yoq")).toBeNull();
  });

  it("qator tashlanmagan yorliqlarni ajratadi", () => {
    const html = page("").replace(
      /<b>Муаллиф:<\/b>[^<]*<br><b>Таржимон:<\/b>[^<]*<br>/,
      "Муаллиф: Ёрқинжон ФозилНашриёт: «Hilol-nashr» нашриётиСана: 2019 (2020, 2024)Ҳажми: 192 бетISBN: 978-9910-719-69-1",
    );
    expect(parseHilolPage(html, "x")).toMatchObject({
      authors: ["Ёрқинжон Фозил"],
      publisher: "Hilol-Nashr",
      published_year: 2019,
      page_count: 192,
      isbn: "978-9910-719-69-1",
    });
  });

  it("plakat va audio diskni oʻtkazib yuboradi", () => {
    const html = page("<b>ISBN:</b> 978-9910-273-91-9");
    expect(parseHilolPage(html.replace("«Хаёла»", "40 фарз (плакат)"), "40-farz-plakat")).toBeNull();
    expect(parseHilolPage(html.replace("«Хаёла»", "«Жума мавъизалари» 9-диск (МР3)"), "salohiddin")).toBeNull();
    expect(parseHilolPage(html.replace("«Хаёла»", "Араб алифбосининг ҳуснихат дафтари"), "daftar")).not.toBeNull();
    // plakat ekani faqat tavsifda: "Муаллиф: …Номи: «…» (плакат)"
    expect(parseHilolPage(html.replace("Абдулкарим Ҳасан", "Абдул Азим ЗиёуддинНоми: «Иймон калималари» (плакат)"), "Asmoi-husno-lotin")).toBeNull();
  });

  it("asar kaliti: yozuv va muqova izohi farq qilmaydi, jild raqami farq qiladi", () => {
    expect(workKey("Виртуал олам болалари (кирилл)")).toBe(workKey("Virtual olam bolalari (lotincha)"));
    expect(workKey("Бахтиёр оила (совғабоп, қутисиз)")).toBe(workKey("Baxtiyor oila"));
    expect(workKey("Сийрати набавия (1-жуз)")).not.toBe(workKey("Сийрати набавия (2-жуз)"));
    expect(workKey("Зикр аҳлидан сўранг тўплами 4-жилд (экспорт учун)")).toBe(workKey("Зикр аҳлидан сўранг тўплами 4-жилд"));
  });

  it("doʻkon izohi olib tashlanadi, oʻzbekcha nomda apostrof bir xillashadi", () => {
    const html = page("<b>ISBN:</b> 978-9910-273-65-0");
    expect(parseHilolPage(html.replace("«Хаёла»", "Бахтиёр оила (юмшоқ муқова)"), "baxtiyor-oila")?.title).toBe("Бахтиёр оила");
    expect(parseHilolPage(html.replace("«Хаёла»", "O'zbek tilida so'zlashamiz (lotincha)"), "ozbek-tilida")?.title).toBe("Oʻzbek tilida soʻzlashamiz (lotincha)");
    // boshqa tildagi nashr nomiga tegilmaydi
    expect(parseHilolPage(html.replace("«Хаёла»", "King's Arabic"), "kings-arabic")?.title).toBe("King's Arabic");
  });

  it("tuzuvchini muallif sifatida oladi", () => {
    const html = page("<b>ISBN:</b> 978-9910-273-65-0").replace(/<b>Муаллиф:<\/b>[^<]*<br>/, "<b>Тўплаб, нашрга тайёрловчи:</b> Усмон Шавкатуллоҳ<br>");
    expect(parseHilolPage(html, "rasulullohni-tanidim")?.authors).toEqual(["Усмон Шавкатуллоҳ"]);
  });

  it("nashr tilini slug va nomdan aniqlaydi", () => {
    expect(guessLanguage("tajvidli-mushaf-urta-hajmda-qz", "Тәжуидті Құран (қозоқ ва рус тилида)")).toBe("kk");
    expect(guessLanguage("muminning-umr-safari-qr", "Мөминниң өмир сапары")).toBe("kaa");
    expect(guessLanguage("daloilul-xoyrot-arabic-hn", "Далоилул хайрот (arabic)")).toBe("ar");
    expect(guessLanguage("sahih-nabaviy-duolar-rus-tilida", "Саҳиҳ набавий дуолар (рус тилида)")).toBe("ru");
    expect(guessLanguage("Xayola-hn", "Хаёла")).toBe("uz");
  });

  it("nashriyot nomini tozalaydi va kategoriya roʻyxatidan slug'larni oladi", () => {
    expect(cleanPublisher("«Hilol-Nashr» нашриёт-матбааси")).toBe("Hilol-Nashr");
    for (const raw of ["«Hilol nashr»", "HILOL NASHR", "Нilol-Nashr", "Hilol", "«Hilol-Nashr» нашриёт-матбввси", "Ҳилол-Нашр", "Hilol Nahsr", "Hlol", "Hilol-Nashr нашр.."])
      expect(cleanPublisher(raw), raw).toBe("Hilol-Nashr");
    expect(cleanPublisher("Hilol media")).toBe("Hilol media");
    expect(cleanPublisher("«Имом Бухорий халқаро илмий-тадқиқот маркази»")).toBe("Имом Бухорий халқаро илмий-тадқиқот маркази");
    const list = `
      <div class="module"><div class="name"><a href="https://hilolnashr.uz/yon-panel">Yon</a></div></div>
      <div class="main-products product-grid">
        <div class="name"><a href="https://hilolnashr.uz/hilol-nashr/Xayola-hn?page=1&amp;limit=100">«Хаёла»</a></div>
        <div class="name"><a href="https://hilolnashr.uz/hilol-nashr/siyrati-nabaviya?page=1&amp;limit=100">x</a></div>
        <div class="name"><a href="https://hilolnashr.uz/hilol-nashr/Xayola-hn?page=1&amp;limit=100">dup</a></div>
      </div>
      <div class="row pagination-results"></div>
      <div class="name"><a href="https://hilolnashr.uz/karusel">K</a></div>`;
    expect(parseCategoryPage(list)).toEqual(["Xayola-hn", "siyrati-nabaviya"]);
  });
});
