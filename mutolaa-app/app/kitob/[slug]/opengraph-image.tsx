import { ImageResponse } from "next/og";
import sharp from "sharp";
import { getBook } from "@/lib/catalog";
import { formatDuration } from "@/lib/format";
import { site } from "@/lib/site";

// Kitob havolasi Telegram/Instagram'da ulashilganda chiqadigan kartochka (1200×630)

export const alt = "Kitob muqovasi va nomi";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = { bg: "#faf7f2", text: "#1f1b16", muted: "#6b6358", accent: "#1f6f5c", soft: "#e2f0eb" };

// OG rasm kutubxonasi WebP'ni chiza olmaydi (Asaxiy va yuklangan muqovalar WebP) — muqovani JPEG'ga oʻgirib, data URL qilamiz
async function coverDataUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const jpeg = await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 660 }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const book = await getBook(slug);
  const title = book?.title ?? site.name;
  const cover = await coverDataUrl(book?.cover_url);
  const facts = book
    ? [
        book.formats.includes("paper") && book.page_count ? `${book.page_count} bet` : null,
        book.audio_seconds ? `🎧 ${formatDuration(book.audio_seconds)}` : null,
        book.publisherRef?.name,
        book.published_year,
      ].filter(Boolean)
    : [];

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: C.bg, padding: 64, gap: 56, alignItems: "center" }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} width={330} height={442} style={{ borderRadius: 16, objectFit: "cover", boxShadow: "0 20px 40px rgba(0,0,0,0.18)" }} alt="" />
        ) : (
          <div style={{ display: "flex", width: 330, height: 442, borderRadius: 16, background: C.soft, color: C.accent, fontSize: 40, padding: 32, alignItems: "center", textAlign: "center" }}>
            {title}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, height: "100%", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: title.length > 40 ? 52 : 64, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>{title}</div>
            {book?.author_names && <div style={{ fontSize: 34, color: C.accent }}>{book.author_names}</div>}
            {facts.length > 0 && <div style={{ fontSize: 28, color: C.muted }}>{facts.join(" · ")}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, color: C.text }}>
            <div style={{ display: "flex", width: 44, height: 44, borderRadius: 10, background: C.accent }} />
            <span style={{ fontWeight: 700 }}>{site.name}</span>
            <span style={{ color: C.muted }}>· shaxsiy mutolaa kundaligi</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
