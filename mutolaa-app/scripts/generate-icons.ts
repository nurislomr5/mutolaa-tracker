/**
 * PWA va favicon ikonkalari — saytdagi logodagi xatchoʻp belgisidan (components/site-header.tsx).
 *
 *   npm run icons   # public/icons/*.png, app/apple-icon.png, app/icon.svg, app/favicon.ico
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const ACCENT = "#1f6f5c";

// scale — belgi oʻlchami; maskable ikonkada Android doira/kvadrat qilib kesadi, shuning uchun kichikroq va burchaksiz
function svg({ scale, radius }: { scale: number; radius: number }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="${ACCENT}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-16 -16)">
    <path d="M10 4h12a2 2 0 0 1 2 2v21.1a.9.9 0 0 1-1.42.73L16 23.2l-6.58 4.63A.9.9 0 0 1 8 27.1V6a2 2 0 0 1 2-2Z" fill="#fff"/>
  </g>
</svg>`;
}

const any = svg({ scale: 12, radius: 112 });
const maskable = svg({ scale: 9.5, radius: 0 });
const png = (source: string, size: number) => sharp(Buffer.from(source)).resize(size, size).png().toBuffer();

// ICO ichida PNG saqlash mumkin (Vista+) — sharp ICO yozmaydi, shuning uchun sarlavhani oʻzimiz yozamiz
function ico(images: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size % 256, e);
    header.writeUInt8(size % 256, e + 1);
    header.writeUInt16LE(1, e + 4); // planes
    header.writeUInt16LE(32, e + 6); // bpp
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

async function main() {
  writeFileSync("public/icons/icon-192.png", await png(any, 192));
  writeFileSync("public/icons/icon-512.png", await png(any, 512));
  writeFileSync("public/icons/maskable-512.png", await png(maskable, 512));
  // iOS oʻzi burchaklarni yumaloqlaydi — toʻliq kvadrat
  writeFileSync("app/apple-icon.png", await png(svg({ scale: 11, radius: 0 }), 180));
  writeFileSync("app/icon.svg", any);
  writeFileSync("app/favicon.ico", ico([{ size: 32, data: await png(any, 32) }, { size: 48, data: await png(any, 48) }]));
  console.log("✓ ikonkalar yaratildi");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
