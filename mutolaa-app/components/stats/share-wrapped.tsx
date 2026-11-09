"use client";

import { Button } from "@/components/ui/button";
import { formatCount, formatDuration } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";

export function ShareStatsButton({
  year,
  booksRead,
  goal,
  pages,
  minutes,
  longestStreak,
  activeDays,
  topTopic,
}: {
  year: number;
  booksRead: number;
  goal: number | null;
  pages: number;
  minutes: number;
  longestStreak: number;
  activeDays: number;
  topTopic?: string;
}) {
  async function handleShare() {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
    grad.addColorStop(0, "#12231a");
    grad.addColorStop(1, "#214231");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1080);

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 3;
    ctx.strokeRect(56, 56, 968, 968);

    ctx.fillStyle = "#d4af37";
    ctx.font = "600 34px system-ui, sans-serif";
    ctx.fillText(`SAHIFA · ${year}-YIL SARHISOBI`, 110, 150);

    ctx.fillStyle = "#f7f4ee";
    ctx.font = "bold 150px Georgia, serif";
    ctx.fillText(String(booksRead), 110, 330);

    ctx.fillStyle = "rgba(247,244,238,0.8)";
    ctx.font = "500 36px system-ui, sans-serif";
    ctx.fillText(goal ? `ta kitob oʻqildi (maqsad: ${goal})` : "ta kitob oʻqildi", 110, 390);

    const tiles: [string, string][] = [
      ["Oʻqilgan betlar", formatCount(pages)],
      ["Tinglangan audio", formatDuration(minutes * 60) ?? "0 daq"],
      ["Eng uzun streak", `${longestStreak} kun`],
      ["Faol kunlar", `${activeDays} kun`],
    ];

    tiles.forEach(([label, val], idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = 110 + col * 440;
      const y = 470 + row * 175;
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(x, y, 410, 145);
      ctx.fillStyle = "rgba(247,244,238,0.65)";
      ctx.font = "400 26px system-ui, sans-serif";
      ctx.fillText(label, x + 28, y + 52);
      ctx.fillStyle = "#f7f4ee";
      ctx.font = "bold 44px system-ui, sans-serif";
      ctx.fillText(val, x + 28, y + 112);
    });

    if (topTopic) {
      ctx.fillStyle = "#d4af37";
      ctx.font = "500 30px system-ui, sans-serif";
      ctx.fillText(`Sevimli mavzu: ${topTopic}`, 110, 895);
    }

    ctx.fillStyle = "rgba(247,244,238,0.5)";
    ctx.font = "500 24px system-ui, sans-serif";
    ctx.fillText("Sahifa · mutolaa.uz", 780, 965);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const file = new File([blob], `sahifa-${year}.png`, { type: "image/png" });
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Sahifa ${year}` });
        return;
      } catch {
        // fallback to download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sahifa-${year}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => void handleShare()}>
      📤 {uz.stats.shareWrapped}
    </Button>
  );
}
