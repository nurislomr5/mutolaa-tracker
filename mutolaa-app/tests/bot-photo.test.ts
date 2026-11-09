import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/full";

// Telegram botga shtrix-kod rasmi: lib/bot/barcode.ts (haqiqiy zxing + sharp) va handleUpdate oqimi
// (Telegram va Supabase soxta — tarmoqqa ham, bazaga ham hech narsa ketmaydi).

const ISBN = "9789943479708";

async function barcodePng(code: string) {
  const out = await writeBarcode(code, { format: "EAN13", scale: 3 } as never);
  return Buffer.from(await (out.image as Blob).arrayBuffer());
}

// Telefon suratiga oʻxshatish: fon ustida kichik, biroz qiyshiq, xira va JPEG siqilgan kod
async function fakePhoto(code: string, { angle = 7, rotate = 0 } = {}) {
  const tilted = await sharp(await barcodePng(code)).rotate(angle, { background: "#ffffff" }).toBuffer();
  const photo = await sharp({ create: { width: 1280, height: 960, channels: 3, background: "#cfc6b5" } })
    .composite([{ input: tilted, left: 420, top: 380 }])
    .blur(0.8)
    .rotate(rotate)
    .jpeg({ quality: 65 })
    .toBuffer();
  return photo.buffer.slice(photo.byteOffset, photo.byteOffset + photo.byteLength) as ArrayBuffer;
}

async function blankPhoto() {
  const b = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#ddd" } }).jpeg().toBuffer();
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

beforeAll(async () => {
  const wasm = fs.readFileSync(path.join(__dirname, "..", "node_modules", "zxing-wasm", "dist", "full", "zxing_full.wasm"));
  await prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer }, fireImmediately: true });
}, 30_000);

describe("readIsbnFromImage", () => {
  it("telefon suratidagi qiyshiq kodni oʻqiydi", async () => {
    const { readIsbnFromImage } = await import("@/lib/bot/barcode");
    expect(await readIsbnFromImage(await fakePhoto(ISBN))).toBe(ISBN);
  });

  it("90° burilgan rasmni ham oʻqiydi", async () => {
    const { readIsbnFromImage } = await import("@/lib/bot/barcode");
    expect(await readIsbnFromImage(await fakePhoto(ISBN, { angle: -4, rotate: 90 }))).toBe(ISBN);
  });

  it("kodsiz rasm va ISBN boʻlmagan EAN-13 uchun null", async () => {
    const { readIsbnFromImage } = await import("@/lib/bot/barcode");
    expect(await readIsbnFromImage(await blankPhoto())).toBeNull();
    // oddiy doʻkon mahsuloti (978/979 bilan boshlanmaydi)
    expect(await readIsbnFromImage(await fakePhoto("4006381333931"))).toBeNull();
  });
});

// ---------- handleUpdate: foto → ISBN → katalog ----------

const tg = { sent: [] as { chatId: number; text: string; keyboard?: unknown }[], photo: null as ArrayBuffer | null };
const catalog = {
  book: { id: 7, slug: "kitob", title: "Oʻtkan kunlar", author_names: "Abdulla Qodiriy", cover_url: null, page_count: 400 } as Record<string, unknown> | null,
  myStatus: null as string | null,
};

vi.mock("@/lib/bot/telegram", () => ({
  appUrl: () => "https://sahifa.test",
  esc: (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  sendMessage: async (chatId: number, text: string, keyboard?: unknown) => void tg.sent.push({ chatId, text, keyboard }),
  downloadFile: async () => tg.photo,
  answerCallback: async () => {},
  answerInlineQuery: async () => {},
  drawBar: () => "",
}));
vi.mock("@/lib/bot/ai", () => ({ parseIntent: async () => ({ action: "UNKNOWN", reply: "ai" }) }));
vi.mock("@/lib/isbn", async (orig) => ({ ...(await orig<typeof import("@/lib/isbn")>()), fetchExternalIsbnMeta: async () => ({ title: "Yangi kitob", authors: "Muallif" }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const b = {
        select: () => b,
        eq: () => b,
        in: () => b,
        limit: () => b,
        maybeSingle: async () => {
          if (table === "telegram_accounts") return { data: { user_id: "u-1" } };
          if (table === "profiles") return { data: { id: "u-1", display_name: "Ali", yearly_goal: null } };
          if (table === "book_sources") return { data: catalog.book ? { books: catalog.book } : null };
          if (table === "books") return { data: null };
          if (table === "user_books") return { data: catalog.myStatus ? { status: catalog.myStatus } : null };
          return { data: null };
        },
      };
      return b;
    },
  }),
}));

const { handleUpdate } = await import("@/lib/bot/handlers");

const photoUpdate = (n: number) => ({
  update_id: n,
  message: {
    message_id: n,
    from: { id: 999000111 + n },
    chat: { id: 555, type: "private" },
    photo: [
      { file_id: "small", width: 90, height: 67 },
      { file_id: "big", width: 1280, height: 960 },
    ],
  },
});

describe("bot: shtrix-kod rasmi", () => {
  beforeEach(() => {
    tg.sent = [];
    catalog.myStatus = null;
    catalog.book = { id: 7, slug: "kitob", title: "Oʻtkan kunlar", author_names: "Abdulla Qodiriy", cover_url: null, page_count: 400 };
  });

  it("kitobni topib, javonga qoʻshish tugmalarini yuboradi", async () => {
    tg.photo = await fakePhoto(ISBN);
    expect(await handleUpdate(photoUpdate(1))).toBe("isbn_found");
    const [m] = tg.sent;
    expect(m.text).toContain("Oʻtkan kunlar");
    expect(m.text).toContain(ISBN);
    expect(JSON.stringify(m.keyboard)).toContain("st:7:reading");
    expect(JSON.stringify(m.keyboard)).toContain("https://sahifa.test/kitob/kitob");
  });

  it("javonda boʻlsa holatini aytadi", async () => {
    tg.photo = await fakePhoto(ISBN);
    catalog.myStatus = "reading";
    await handleUpdate(photoUpdate(2));
    expect(tg.sent[0].text).toContain("Oʻqiyapman");
  });

  it("katalogda yoʻq boʻlsa saytda qoʻshish havolasini beradi", async () => {
    tg.photo = await fakePhoto(ISBN);
    catalog.book = null;
    expect(await handleUpdate(photoUpdate(3))).toBe("isbn_not_found");
    expect(tg.sent[0].text).toContain("Yangi kitob");
    expect(JSON.stringify(tg.sent[0].keyboard)).toContain(`/kitob-qoshish?isbn=${ISBN}&nom=Yangi+kitob`);
  });

  it("kod topilmasa maslahat beradi", async () => {
    tg.photo = await blankPhoto();
    expect(await handleUpdate(photoUpdate(4))).toBe("photo_no_barcode");
    expect(tg.sent[0].text).toContain("/isbn");
  });

  it("/isbn buyrugʻi va faqat raqam yozilgan xabar ham ishlaydi", async () => {
    const text = (n: number, t: string) => ({ update_id: n, message: { message_id: n, from: { id: 999000200 + n }, chat: { id: 555, type: "private" }, text: t } });
    expect(await handleUpdate(text(5, `/isbn 978-9943-4797-0-8`))).toBe("isbn_found");
    expect(await handleUpdate(text(6, ISBN))).toBe("isbn_found");
    expect(await handleUpdate(text(7, "/isbn 12345"))).toBe("isbn_invalid");
  });
});
