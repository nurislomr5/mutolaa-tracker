import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { isbnDigits, isbnVariants } from "@/lib/isbn";

// Rasm (Telegram foto/fayl) dagi ISBN shtrix-kodini serverda oʻqish — sayt skaneri bilan bir xil zxing kutubxonasi.
// .wasm fayl CDN'dan emas, node_modules'dan oʻqiladi (next.config.ts: outputFileTracingIncludes).

const WASM_PATH = path.join(process.cwd(), "node_modules", "zxing-wasm", "dist", "reader", "zxing_reader.wasm");

let ready: Promise<unknown> | null = null;

function initReader() {
  ready ??= fs.readFile(WASM_PATH).then((buf) =>
    prepareZXingModule({
      overrides: { wasmBinary: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer },
      fireImmediately: true,
    }),
  );
  return ready;
}

async function decode(image: Buffer) {
  const results = await readBarcodes(new Uint8Array(image), {
    formats: ["EAN13"],
    tryHarder: true,
    tryRotate: true,
    maxNumberOfSymbols: 3,
  });
  for (const r of results) {
    const variants = r.isValid ? isbnVariants(r.text) : null;
    if (variants) return isbnDigits(variants[0]);
  }
  return null;
}

// Topilmasa null. Avval EXIF boʻyicha toʻgʻrilangan kulrang nusxa (≤1600px), soʻng kichikroq (≤900px) —
// kod rasmda juda katta yoki shovqinli boʻlsa kichraytirish yordam beradi.
export async function readIsbnFromImage(bytes: ArrayBuffer): Promise<string | null> {
  await initReader();
  const base = sharp(Buffer.from(bytes), { limitInputPixels: 40_000_000 }).rotate().grayscale();
  for (const size of [1600, 900]) {
    const image = await base.clone().resize({ width: size, height: size, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const isbn = await decode(image);
    if (isbn) return isbn;
  }
  return null;
}
