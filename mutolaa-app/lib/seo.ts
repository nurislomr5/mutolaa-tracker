import type { BookDetail } from "@/lib/catalog";
import { formatDuration } from "@/lib/format";
import { site, siteUrl } from "@/lib/site";

// Qidiruv tizimlari uchun kitob tavsifi va Book JSON-LD

const FORMAT_WORDS = { paper: "qogʻoz", ebook: "elektron", audio: "audio" } as const;

function cut(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

// "«Atom odatlar», Jeyms Klir. Qogʻoz (300 bet, Asaxiy Books, 2023), audio (5 soat), elektron. …"
export function bookDescription(book: BookDetail) {
  const formats = book.formats.map((f) => {
    if (f === "paper") {
      const details = [book.page_count ? `${book.page_count} bet` : null, book.publisherRef?.name, book.published_year].filter(Boolean);
      return details.length ? `qogʻoz (${details.join(", ")})` : "qogʻoz";
    }
    if (f === "audio" && book.audio_seconds) return `audio (${formatDuration(book.audio_seconds)})`;
    return FORMAT_WORDS[f];
  });
  const head = `«${book.title}»${book.author_names ? `, ${book.author_names}` : ""}.`;
  const kinds = formats.length ? ` ${formats.join(", ").replace(/^./, (c) => c.toUpperCase())}.` : "";
  const tail = book.description ? ` ${book.description.replace(/\s+/g, " ")}` : ` Oʻqing, tinglang va mutolaangizni ${site.name}da belgilab boring.`;
  return cut(`${head}${kinds}${tail}`, 160);
}

export function bookJsonLd(book: BookDetail) {
  const base = siteUrl();
  const data = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    url: `${base}/kitob/${book.slug}`,
    image: book.cover_url ?? undefined,
    description: book.description ? cut(book.description.replace(/\s+/g, " "), 500) : undefined,
    author: book.authors.map((a) => ({ "@type": "Person", name: a.name, url: `${base}/muallif/${a.slug}` })),
    isbn: book.isbn ?? undefined,
    numberOfPages: book.page_count ?? undefined,
    publisher: book.publisherRef ? { "@type": "Organization", name: book.publisherRef.name } : undefined,
    datePublished: book.published_year ? String(book.published_year) : undefined,
    translator: book.translator ? { "@type": "Person", name: book.translator } : undefined,
    inLanguage: "uz",
  };
  // "</script>" kabi matn skriptni yopib qoʻymasligi uchun "<" ni qochiramiz
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
