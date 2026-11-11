import { formatCount, formatDuration } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { site, siteHost } from "@/lib/site";

// Ulashiladigan rasmlar (iqtibos, taqriz, yil sarhisobi) — brauzerda <canvas> ustida chiziladi, serverga hech narsa ketmaydi.
// Ikki oʻlcham: kvadrat (lenta, Telegram) va storis (9:16).

export type ShareFormat = "square" | "story";

export const SHARE_SIZE: Record<ShareFormat, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

export type ShareBook = { title: string; author?: string | null; cover?: string | null };

export type ShareCard =
  // label boʻlmasa — katta qoʻshtirnoq belgisi chiziladi (iqtibos)
  | { kind: "quote"; text: string; label: string | null; book?: ShareBook; reference?: string | null }
  | { kind: "review"; text: string; rating: number | null; book: ShareBook; reader?: string | null }
  | {
      kind: "year";
      year: number;
      books: number;
      goal: number | null;
      pages: number;
      minutes: number;
      longestStreak: number;
      activeDays: number;
      topAuthor?: string | null;
      topTopic?: string | null;
      persona?: string | null;
      covers: string[];
      reader?: string | null;
    };

// ---------- Sof yordamchilar (testlanadi) ----------

export type Measure = (text: string) => number;

const TRAILING = /[\s.,;:!?—–-]+$/;

// Bir qatorga sigʻmasa — oxirini kesib "…" qoʻyadi
export function ellipsize(measure: Measure, text: string, maxWidth: number, force = false) {
  if (!force && measure(text) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length && measure(`${chars.join("")}…`) > maxWidth) chars.pop();
  return `${chars.join("").replace(TRAILING, "")}…`;
}

// Bitta soʻz qatordan uzun boʻlsa (havola, uzun raqam) — harflab boʻlinadi
function breakWord(measure: Measure, word: string, maxWidth: number) {
  const parts: string[] = [];
  let part = "";
  for (const ch of word) {
    if (part && measure(part + ch) > maxWidth) {
      parts.push(part);
      part = ch;
    } else {
      part += ch;
    }
  }
  if (part) parts.push(part);
  return parts;
}

// Matnni qatorlarga boʻladi; abzaslar saqlanadi. maxLines dan oshsa — kesiladi va oxirgi qatorga "…" qoʻyiladi
export function wrapText(measure: Measure, text: string, maxWidth: number, maxLines: number) {
  const lines: string[] = [];
  const paragraphs = text
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  for (const p of paragraphs) {
    let line = "";
    for (const raw of p.split(" ")) {
      const pieces = measure(raw) > maxWidth ? breakWord(measure, raw, maxWidth) : [raw];
      for (const w of pieces) {
        const test = line ? `${line} ${w}` : w;
        if (line && measure(test) > maxWidth) {
          lines.push(line);
          line = w;
        } else {
          line = test;
        }
      }
    }
    if (line) lines.push(line);
  }
  const limit = Math.max(1, maxLines);
  if (lines.length <= limit) return { lines, truncated: false };
  const kept = lines.slice(0, limit);
  kept[limit - 1] = ellipsize(measure, kept[limit - 1], maxWidth, true);
  return { lines: kept, truncated: true };
}

// Matn sigʻadigan eng katta shrift oʻlchamini tanlaydi (sizes — kattadan kichikka); hech biri sigʻmasa — eng kichigi, kesilgan holda
export function fitText(measureAt: (size: number) => Measure, text: string, maxWidth: number, maxHeight: number, sizes: number[], leading = 1.42) {
  let result = { size: sizes[0], lineHeight: Math.round(sizes[0] * leading), lines: [] as string[], truncated: false };
  for (const size of sizes) {
    const lineHeight = Math.round(size * leading);
    const wrapped = wrapText(measureAt(size), text, maxWidth, Math.floor(maxHeight / lineHeight));
    result = { size, lineHeight, ...wrapped };
    if (!wrapped.truncated) break;
  }
  return result;
}

// Bu manbalar boshqa saytlarga rasmni ochiq bermaydi (CORS yoʻq) — canvas'ga chizish uchun oʻz serverimiz orqali olinadi.
// Roʻyxat next.config.ts dagi images.remotePatterns bilan bir xil boʻlishi shart (tests/share-image.test.ts tekshiradi).
export const COVER_PROXY_HOSTS = ["cdn-minio.mutolaa.com", "assets.asaxiy.uz", "hilolnashr.uz"];

// Muqovani canvas'ga xavfsiz yuklash manzili: oʻz domenimiz, proksi yoki CORS bilan toʻgʻridan-toʻgʻri
export function coverSource(url: string | null | undefined): { src: string; cors: boolean } | null {
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return { src: url, cors: false };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (COVER_PROXY_HOSTS.includes(parsed.hostname)) return { src: `/_next/image?url=${encodeURIComponent(url)}&w=384&q=75`, cors: false };
  // Supabase Storage (foydalanuvchi yuklagan muqovalar) CORS'ga ruxsat beradi; boshqa manba ruxsat bermasa — muqovasiz chiziladi
  return { src: url, cors: true };
}

// ---------- Chizish ----------

type Ctx = CanvasRenderingContext2D;
type Fonts = { serif: string; sans: string };
type Img = HTMLImageElement | null;
type Painter = { ctx: Ctx; W: number; H: number; story: boolean; f: Fonts; images: Img[] };

const PAD = 110;
const COVER_RATIO = 520 / 697;
const MAX_TEXT = 1600;

const C = {
  bg0: "#12231a",
  bg1: "#214231",
  frame: "rgba(255,255,255,0.15)",
  ink: "#f7f4ee",
  inkSoft: "rgba(247,244,238,0.75)",
  inkFaint: "rgba(247,244,238,0.5)",
  gold: "#d4af37",
  goldSoft: "rgba(212,175,55,0.35)",
  goldTint: "rgba(212,175,55,0.12)",
  tile: "rgba(255,255,255,0.07)",
  coverBack: "#2c5340",
  starEmpty: "rgba(247,244,238,0.2)",
};

function cssFont(variable: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

// Sayt shriftlari (Literata, Inter) canvas'da ishlashi uchun oldindan yuklanadi; ulgurmasa — tizim shriftlari bilan chiziladi
async function loadFonts(sample: string): Promise<Fonts> {
  const f = { serif: cssFont("--font-literata", "Georgia, serif"), sans: cssFont("--font-inter", "system-ui, sans-serif") };
  const specs = [`400 40px ${f.serif}`, `italic 400 40px ${f.serif}`, `700 40px ${f.serif}`, `400 28px ${f.sans}`, `600 28px ${f.sans}`, `700 28px ${f.sans}`];
  try {
    await Promise.race([
      Promise.all(specs.map((spec) => document.fonts.load(spec, sample))),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // shrift yuklanmadi — zaxira shrift ishlatiladi
  }
  return f;
}

function loadCover(url: string | null | undefined): Promise<Img> {
  const source = coverSource(url);
  if (!source) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    if (source.cors) img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth > 0 ? img : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = source.src;
  });
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function setText(ctx: Ctx, font: string, color: string, align: CanvasTextAlign = "left", baseline: CanvasTextBaseline = "alphabetic") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
}

function measurer(ctx: Ctx, font: string): Measure {
  ctx.font = font;
  return (text) => ctx.measureText(text).width;
}

function drawBackground({ ctx, W, H }: Painter) {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, C.bg0);
  grad.addColorStop(1, C.bg1);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.frame;
  ctx.lineWidth = 3;
  ctx.strokeRect(56, 56, W - 112, H - 112);
}

// Kichik sarlavha (TAQRIZ, XULOSA, ...): oltin rang, harflar orasi ochiq
function drawLabel({ ctx, f }: Painter, text: string, y: number) {
  ctx.save();
  setText(ctx, `600 30px ${f.sans}`, C.gold);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
  ctx.fillText(text.toUpperCase(), PAD, y);
  ctx.restore();
}

// Pastki qator: chapda — kitobxon ismi (boʻlsa), oʻngda — xatchoʻp belgisi va sayt manzili
function drawFooter({ ctx, W, f }: Painter, y: number, left?: string | null) {
  const brand = `${site.name} · ${siteHost()}`;
  setText(ctx, `500 26px ${f.sans}`, C.inkFaint);
  const brandWidth = ctx.measureText(brand).width;
  const x = W - PAD - brandWidth;
  ctx.fillText(brand, x, y);

  // xatchoʻp (bookmark) belgisi
  const bw = 18;
  const bh = 26;
  const bx = x - bw - 14;
  const by = y - bh + 3;
  ctx.fillStyle = C.gold;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + bw, by);
  ctx.lineTo(bx + bw, by + bh);
  ctx.lineTo(bx + bw / 2, by + bh * 0.72);
  ctx.lineTo(bx, by + bh);
  ctx.closePath();
  ctx.fill();

  if (left) {
    const font = `500 28px ${f.sans}`;
    const text = ellipsize(measurer(ctx, font), left, bx - PAD - 40);
    setText(ctx, font, C.inkSoft);
    ctx.fillText(text, PAD, y);
  }
}

function drawCover({ ctx, f }: Painter, img: Img, x: number, y: number, w: number, h: number, title: string) {
  const r = Math.round(w * 0.06);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = C.coverBack;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  if (img) {
    // object-fit: cover
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / scale;
    const sh = h / scale;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  } else {
    // muqova yoʻq yoki yuklanmadi — kitob nomining bosh harfi
    setText(ctx, `700 ${Math.round(h * 0.42)}px ${f.serif}`, C.goldSoft, "center", "middle");
    ctx.fillText([...title.trim()][0]?.toUpperCase() ?? "", x + w / 2, y + h / 2);
  }
  ctx.restore();
}

function starPath(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + radius * Math.cos(angle);
    const py = cy + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

const STAR_GAP = 0.2;
const starsWidth = (size: number) => size * 5 + size * STAR_GAP * 4;

// 5 yulduz; yarim baho yulduzning yarmini toʻldiradi
function drawStars(ctx: Ctx, x: number, y: number, size: number, rating: number) {
  for (let i = 0; i < 5; i++) {
    const left = x + i * size * (1 + STAR_GAP);
    const cx = left + size / 2;
    const cy = y + size / 2;
    starPath(ctx, cx, cy, size / 2);
    ctx.fillStyle = C.starEmpty;
    ctx.fill();
    const fill = Math.max(0, Math.min(1, rating - i));
    if (fill <= 0) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, y, size * fill, size);
    ctx.clip();
    starPath(ctx, cx, cy, size / 2);
    ctx.fillStyle = C.gold;
    ctx.fill();
    ctx.restore();
  }
}

// Qatorlar bloki: har bir qator oʻz "katagi"ning oʻrtasida
function drawLines(ctx: Ctx, lines: string[], x: number, top: number, lineHeight: number) {
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => ctx.fillText(line, x, top + i * lineHeight + lineHeight / 2));
}

function paintQuote(p: Painter, card: Extract<ShareCard, { kind: "quote" }>) {
  const { ctx, W, f, story } = p;
  let top: number;
  if (card.label) {
    drawLabel(p, card.label, story ? 300 : 150);
    top = story ? 360 : 200;
  } else {
    setText(ctx, `700 ${story ? 220 : 180}px ${f.serif}`, C.goldSoft);
    ctx.fillText("“", PAD - 8, story ? 410 : 250);
    top = story ? 370 : 220;
  }

  const footerY = story ? 1640 : 970;
  const book = card.book;
  const cover = p.images[0];
  const coverH = story ? 190 : 116;
  const coverW = Math.round(coverH * COVER_RATIO);
  const metaLines = [book?.title, book?.author, card.reference].filter(Boolean).length;
  const metaH = metaLines === 0 ? 0 : Math.max(cover ? coverH : 0, metaLines * (story ? 50 : 42));
  const bottom = footerY - (story ? 100 : 66) - (metaH ? metaH + (story ? 60 : 40) : 0);

  const italic = card.label ? "" : "italic ";
  const fit = fitText(
    (size) => measurer(ctx, `${italic}400 ${size}px ${f.serif}`),
    card.text,
    W - PAD * 2,
    bottom - top,
    story ? [66, 58, 52, 46, 42, 38, 34] : [54, 48, 44, 40, 36, 32, 28, 26],
  );
  const textTop = top + Math.max(0, bottom - top - fit.lines.length * fit.lineHeight) * (story ? 0.4 : 0.3);
  setText(ctx, `${italic}400 ${fit.size}px ${f.serif}`, C.ink);
  drawLines(ctx, fit.lines, PAD, textTop, fit.lineHeight);

  if (metaH) {
    const metaTop = bottom + (story ? 60 : 40);
    let x = PAD;
    if (cover && book) {
      drawCover(p, cover, PAD, metaTop + (metaH - coverH) / 2, coverW, coverH, book.title);
      x += coverW + 28;
    }
    const width = W - PAD - x;
    const step = story ? 50 : 42;
    let y = metaTop + (metaH - metaLines * step) / 2 + step / 2;
    const line = (text: string, font: string, color: string) => {
      const fitted = ellipsize(measurer(ctx, font), text, width);
      setText(ctx, font, color, "left", "middle");
      ctx.fillText(fitted, x, y);
      y += step;
    };
    if (book?.title) line(cover ? book.title : `— ${book.title}`, `600 ${story ? 38 : 32}px ${f.sans}`, C.gold);
    if (book?.author) line(book.author, `400 ${story ? 32 : 27}px ${f.sans}`, C.inkSoft);
    if (card.reference) line(card.reference, `400 ${story ? 30 : 25}px ${f.sans}`, C.inkFaint);
  }

  drawFooter(p, footerY);
}

function paintReview(p: Painter, card: Extract<ShareCard, { kind: "review" }>) {
  const { ctx, W, f, story } = p;
  const footerY = story ? 1640 : 970;
  drawLabel(p, uz.share.reviewLabel, story ? 300 : 150);

  const coverH = story ? 360 : 250;
  const coverW = Math.round(coverH * COVER_RATIO);
  const coverX = story ? (W - coverW) / 2 : PAD;
  const coverY = story ? 350 : 190;
  drawCover(p, p.images[0], coverX, coverY, coverW, coverH, card.book.title);

  // Kitob nomi, muallif, yulduzlar: kvadratda — muqova yonida, storisda — muqova ostida oʻrtada
  const titleSize = story ? 52 : 44;
  const titleLH = Math.round(titleSize * 1.22);
  const titleFont = `700 ${titleSize}px ${f.serif}`;
  const colX = story ? PAD : PAD + coverW + 36;
  const colW = W - PAD - colX;
  const title = wrapText(measurer(ctx, titleFont), card.book.title, colW, 3).lines;
  const authorH = card.book.author ? (story ? 56 : 46) : 0;
  const starSize = story ? 46 : 38;
  const starsH = card.rating ? starSize + (story ? 26 : 20) : 0;
  const stackH = title.length * titleLH + authorH + starsH;
  let y = story ? coverY + coverH + 50 : coverY + Math.max(0, (coverH - stackH) / 2);
  const align: CanvasTextAlign = story ? "center" : "left";
  const anchor = story ? W / 2 : colX;

  setText(ctx, titleFont, C.ink, align);
  drawLines(ctx, title, anchor, y, titleLH);
  y += title.length * titleLH;
  if (card.book.author) {
    const font = `400 ${story ? 32 : 28}px ${f.sans}`;
    const author = ellipsize(measurer(ctx, font), card.book.author, colW);
    setText(ctx, font, C.inkSoft, align, "middle");
    ctx.fillText(author, anchor, y + authorH / 2);
    y += authorH;
  }
  if (card.rating) {
    const sx = story ? (W - starsWidth(starSize)) / 2 : colX;
    drawStars(ctx, sx, y + (starsH - starSize) / 2, starSize, card.rating);
    y += starsH;
  }

  const top = (story ? y : Math.max(y, coverY + coverH)) + (story ? 50 : 44);
  const bottom = footerY - (story ? 100 : 66);
  const fit = fitText(
    (size) => measurer(ctx, `400 ${size}px ${f.serif}`),
    card.text,
    W - PAD * 2,
    bottom - top,
    story ? [46, 42, 38, 34, 32, 30, 28] : [40, 36, 32, 30, 28, 26],
    1.45,
  );
  setText(ctx, `400 ${fit.size}px ${f.serif}`, C.ink);
  drawLines(ctx, fit.lines, PAD, top, fit.lineHeight);

  drawFooter(p, footerY, card.reader ? uz.share.reviewBy(card.reader) : null);
}

// Rasm katagiga sigʻishi uchun qisqa koʻrinish: bir soatdan oshsa — faqat (yaxlitlangan) soatlar
export function shortDuration(minutes: number): string | null {
  return formatDuration(minutes >= 60 ? Math.round(minutes / 60) * 3600 : minutes * 60);
}

function paintYear(p: Painter, card: Extract<ShareCard, { kind: "year" }>) {
  const { ctx, W, f, story } = p;
  const t = uz.share;
  const footerY = story ? 1640 : 970;
  drawLabel(p, `${site.name} · ${t.yearHeader(card.year)}`, story ? 300 : 150);

  setText(ctx, `700 ${story ? 230 : 150}px ${f.serif}`, C.ink);
  ctx.fillText(String(card.books), PAD - 6, story ? 560 : 330);
  setText(ctx, `500 ${story ? 40 : 34}px ${f.sans}`, C.inkSoft);
  ctx.fillText(card.goal ? `${t.booksRead} · ${t.goalNote(card.goal)}` : t.booksRead, PAD, story ? 630 : 390);

  // Muqovalar: kvadratda — oʻng yuqorida yelpigʻich, storisda — bir qator
  const covers = p.images.filter(Boolean);
  let y = story ? 700 : 440;
  if (story) {
    if (covers.length) {
      const h = 241;
      const w = Math.round(h * COVER_RATIO);
      const step = covers.length > 1 ? Math.min(w + 24, (W - PAD * 2 - w) / (covers.length - 1)) : 0;
      const startX = (W - (w + step * (covers.length - 1))) / 2;
      covers.forEach((img, i) => {
        ctx.save();
        ctx.translate(startX + i * step + w / 2, y + h / 2 + 10);
        ctx.rotate((i % 2 === 0 ? -1 : 1) * 0.045);
        drawCover(p, img, -w / 2, -h / 2, w, h, "");
        ctx.restore();
      });
      y += h + 70;
    } else {
      y += 30;
    }
  } else if (covers.length) {
    const h = 201;
    const w = Math.round(h * COVER_RATIO);
    // chetdagilar avval, oʻrtadagisi ustidan
    const order = covers.length === 3 ? [0, 2, 1] : covers.map((_, i) => i);
    const centerX = 820;
    for (const i of order) {
      const offset = i - (covers.length - 1) / 2;
      ctx.save();
      ctx.translate(centerX + offset * 92, 288 + Math.abs(offset) * 12);
      ctx.rotate(offset * 0.13);
      drawCover(p, covers[i], -w / 2, -h / 2, w, h, "");
      ctx.restore();
    }
  }

  const tiles: [string, string][] = [
    [t.tiles.pages, formatCount(card.pages)],
    [t.tiles.audio, shortDuration(card.minutes) ?? t.noAudio],
    [t.tiles.streak, t.daysValue(card.longestStreak)],
    [t.tiles.days, t.daysValue(card.activeDays)],
  ];
  const gap = 20;
  const tileW = (W - PAD * 2 - gap) / 2;
  const tileH = story ? 170 : 140;
  tiles.forEach(([label, value], i) => {
    const x = PAD + (i % 2) * (tileW + gap);
    const ty = y + Math.floor(i / 2) * (tileH + gap);
    roundRect(ctx, x, ty, tileW, tileH, 18);
    ctx.fillStyle = C.tile;
    ctx.fill();
    setText(ctx, `400 ${story ? 30 : 26}px ${f.sans}`, C.inkSoft);
    ctx.fillText(label, x + 28, ty + (story ? 62 : 52));
    const font = `700 ${story ? 52 : 44}px ${f.sans}`;
    const fitted = ellipsize(measurer(ctx, font), value, tileW - 56);
    setText(ctx, font, C.ink);
    ctx.fillText(fitted, x + 28, ty + (story ? 130 : 108));
  });
  y += tileH * 2 + gap;

  const lineStep = story ? 54 : 46;
  const lines = [card.topAuthor ? t.topAuthor(card.topAuthor) : null, card.topTopic ? t.topTopic(card.topTopic) : null].filter((l): l is string => !!l);
  y += story ? 26 : 14;
  lines.forEach((text, i) => {
    const font = `500 ${story ? 34 : 30}px ${f.sans}`;
    const fitted = ellipsize(measurer(ctx, font), text, W - PAD * 2);
    setText(ctx, font, i === 0 ? C.gold : C.inkSoft, "left", "middle");
    ctx.fillText(fitted, PAD, y + lineStep / 2);
    y += lineStep;
  });

  if (card.persona) {
    const font = `600 ${story ? 32 : 28}px ${f.sans}`;
    const text = ellipsize(measurer(ctx, font), `✦ ${card.persona}`, W - PAD * 2 - 56);
    const pillH = story ? 64 : 54;
    const pillW = ctx.measureText(text).width + 56;
    y += story ? 16 : 8;
    roundRect(ctx, PAD, y, pillW, pillH, pillH / 2);
    ctx.fillStyle = C.goldTint;
    ctx.fill();
    ctx.strokeStyle = C.goldSoft;
    ctx.lineWidth = 2;
    ctx.stroke();
    setText(ctx, font, C.gold, "left", "middle");
    ctx.fillText(text, PAD + 28, y + pillH / 2 + 1);
  }

  drawFooter(p, footerY, card.reader);
}

function paint(p: Painter, card: ShareCard) {
  const { ctx } = p;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  drawBackground(p);
  if (card.kind === "quote") paintQuote(p, card);
  else if (card.kind === "review") paintReview(p, card);
  else paintYear(p, card);
  ctx.restore();
}

function clip(text: string) {
  const chars = [...text.trim()];
  return chars.length > MAX_TEXT ? `${chars.slice(0, MAX_TEXT).join("")}…` : chars.join("");
}

// Rasmni tayyorlaydi (PNG). Muqova tufayli canvas "ifloslansa" — muqovasiz qayta chizadi. Umuman boʻlmasa — null.
export async function renderShareImage(card: ShareCard, format: ShareFormat): Promise<Blob | null> {
  const { width, height } = SHARE_SIZE[format];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const story = format === "story";
  const safe = card.kind === "year" ? card : { ...card, text: clip(card.text) };
  const coverUrls = card.kind === "year" ? card.covers.slice(0, story ? 5 : 3) : [card.book?.cover];
  const [f, images] = await Promise.all([loadFonts(JSON.stringify(safe)), Promise.all(coverUrls.map(loadCover))]);

  for (const withCovers of [true, false]) {
    try {
      paint({ ctx, W: width, H: height, story, f, images: withCovers ? images : images.map(() => null) }, safe);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob) return blob;
    } catch {
      // muqova boshqa domendan CORS'siz kelgan — muqovasiz urinib koʻramiz
    }
  }
  return null;
}
