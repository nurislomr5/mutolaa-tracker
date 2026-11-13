import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

// Sayt havolasi (bosh sahifa, katalog va h.k.) ulashilganda chiqadigan umumiy kartochka

export const alt = `${site.name}: shaxsiy mutolaa kundaligi va kitoblar katalogi`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", height: "100%", background: "#faf7f2", padding: 96, gap: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", width: 72, height: 72, borderRadius: 16, background: "#1f6f5c" }} />
          <span style={{ fontSize: 64, fontWeight: 700, color: "#1f1b16" }}>{site.name}</span>
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, color: "#1f1b16", lineHeight: 1.15, maxWidth: 940 }}>Oʻqigan kitoblaringiz va olgan xulosalaringiz bir joyda yoʻqolmaydi</div>
        <div style={{ fontSize: 32, color: "#6b6358", maxWidth: 960 }}>
          11 mingdan ortiq bosma, elektron va audio kitob. Shaxsiy javon, mutolaa hisobi, qaydlar va statistika oʻzbek tilida.
        </div>
      </div>
    ),
    size,
  );
}
