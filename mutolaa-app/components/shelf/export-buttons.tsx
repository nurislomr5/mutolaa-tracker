"use client";

import { Button } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";
import type { NoteWithBook, ShelfItem } from "@/lib/shelf";
import { site } from "@/lib/site";

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob(["\uFEFF" + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportNotesButton({ notes }: { notes: NoteWithBook[] }) {
  if (notes.length === 0) return null;

  function handleExport() {
    const byBook = new Map<string, NoteWithBook[]>();
    for (const n of notes) {
      const title = n.book?.title ?? "Kitobsiz qaydlar";
      const list = byBook.get(title) ?? [];
      list.push(n);
      byBook.set(title, list);
    }

    const lines: string[] = [`# ${site.name} — ${uz.notes.title}`, ""];
    for (const [bookTitle, items] of byBook) {
      lines.push(`## ${bookTitle}`, "");
      for (const n of items) {
        const { content: body, answer } = n;
        const ref = n.reference_point ? ` (${n.reference_point})` : "";
        const date = n.created_at.slice(0, 10);
        lines.push(`- **[${uz.noteType[n.type]}]**${ref} _${date}_`);
        lines.push(`  ${body.replace(/\n/g, "\n  ")}`);
        if (answer) {
          lines.push(`  > 💡 **${uz.notes.answerLabel}:** ${answer.replace(/\n/g, " ")}`);
        }
        lines.push("");
      }
    }

    downloadTextFile(`${site.slug}-qaydlar.md`, lines.join("\n"), "text/markdown");
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={handleExport}>
      ⬇ {uz.notes.exportMd}
    </Button>
  );
}

function csvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const s = String(val).replace(/"/g, '""');
  return /[",\n\r]/.test(s) ? `"${s}"` : s;
}

export function ExportShelfCsvButton({ items }: { items: ShelfItem[] }) {
  if (items.length === 0) return null;

  function handleExport() {
    const header = ["title", "authors", "status", "format", "current", "total", "unit", "rating", "started_at", "finished_at", "review", "review_is_spoiler"];
    const rows = items.map((i) => [
      csvCell(i.book.title),
      csvCell(i.book.author_names),
      csvCell(uz.status[i.status]),
      csvCell(i.format ? uz.format[i.format] : ""),
      csvCell(i.current_value),
      csvCell(i.total_value),
      csvCell(uz.shelf.unit[i.unit]),
      csvCell(i.rating),
      csvCell(i.started_at?.slice(0, 10)),
      csvCell(i.finished_at?.slice(0, 10)),
      csvCell(i.review),
      csvCell(i.review ? (i.review_is_spoiler ? "ha" : "yoʻq") : ""),
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    downloadTextFile(`${site.slug}-javonim.csv`, csv, "text/csv");
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={handleExport}>
      ⬇ {uz.shelf.exportCsv}
    </Button>
  );
}
