// ISBN yordamchilari (client va server uchun umumiy). Bazada `isbn_digits` — faqat raqamlar va X.

export function isbnDigits(raw: string) {
  return raw.toUpperCase().replace(/[^0-9X]/g, "");
}

export function isValidIsbn13(d: string) {
  if (!/^97[89]\d{10}$/.test(d)) return false;
  const sum = [...d.slice(0, 12)].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(d[12]);
}

export function isValidIsbn10(d: string) {
  if (!/^\d{9}[\dX]$/.test(d)) return false;
  const sum = [...d].reduce((s, c, i) => s + (c === "X" ? 10 : Number(c)) * (10 - i), 0);
  return sum % 11 === 0;
}

function isbn10To13(d: string) {
  const core = `978${d.slice(0, 9)}`;
  const sum = [...core].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
  return `${core}${(10 - (sum % 10)) % 10}`;
}

function isbn13To10(d: string) {
  if (!d.startsWith("978")) return null;
  const core = d.slice(3, 12);
  const sum = [...core].reduce((s, c, i) => s + Number(c) * (10 - i), 0);
  const check = (11 - (sum % 11)) % 11;
  return `${core}${check === 10 ? "X" : check}`;
}

// Qidiruv uchun ikkala koʻrinish (manbada ISBN-10 yoki ISBN-13 saqlangan boʻlishi mumkin). Notoʻgʻri ISBN — null.
export function isbnVariants(raw: string): string[] | null {
  const d = isbnDigits(raw);
  if (isValidIsbn13(d)) return [d, isbn13To10(d)].filter((v): v is string => Boolean(v));
  if (isValidIsbn10(d)) return [isbn10To13(d), d];
  return null;
}

export type ExternalIsbnBook = {
  title: string;
  authors: string;
  page_count: number | null;
  year: number | null;
  publisher: string | null;
  cover_url: string | null;
  description: string | null;
};

// Katalogda topilmagan ISBN uchun xalqaro ochiq bazalardan (Google Books / OpenLibrary) maʼlumot olish
export async function fetchExternalIsbnMeta(isbn: string): Promise<ExternalIsbnBook | null> {
  const variants = isbnVariants(isbn);
  if (!variants) return null;
  const code = variants[0];

  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${code}`, {
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        items?: {
          volumeInfo?: {
            title?: string;
            authors?: string[];
            pageCount?: number;
            publishedDate?: string;
            publisher?: string;
            description?: string;
            imageLinks?: { thumbnail?: string; smallThumbnail?: string };
          };
        }[];
      };
      const info = data.items?.[0]?.volumeInfo;
      if (info?.title && info.authors?.length) {
        const yearMatch = info.publishedDate?.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
        const rawCover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
        return {
          title: info.title.trim().slice(0, 200),
          authors: info.authors.join(", ").slice(0, 300),
          page_count: info.pageCount && info.pageCount > 0 && info.pageCount <= 10000 ? info.pageCount : null,
          year: yearMatch ? Number(yearMatch[1]) : null,
          publisher: info.publisher?.trim().slice(0, 120) ?? null,
          cover_url: rawCover ? rawCover.replace(/^http:\/\//i, "https://") : null,
          description: info.description?.trim().slice(0, 1500) ?? null,
        };
      }
    }
  } catch {
    // keyingi manbaga oʻtamiz
  }

  try {
    const key = `ISBN:${code}`;
    const res = await fetch(`https://openlibrary.org/api/books?bibkeys=${key}&format=json&jscmd=data`, {
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data = (await res.json()) as Record<
        string,
        {
          title?: string;
          authors?: { name?: string }[];
          number_of_pages?: number;
          publish_date?: string;
          publishers?: { name?: string }[];
          cover?: { medium?: string; large?: string };
        }
      >;
      const item = data[key];
      const authors = (item?.authors ?? []).map((a) => a.name?.trim()).filter(Boolean) as string[];
      if (item?.title && authors.length) {
        const yearMatch = item.publish_date?.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
        return {
          title: item.title.trim().slice(0, 200),
          authors: authors.join(", ").slice(0, 300),
          page_count: item.number_of_pages && item.number_of_pages > 0 && item.number_of_pages <= 10000 ? item.number_of_pages : null,
          year: yearMatch ? Number(yearMatch[1]) : null,
          publisher: item.publishers?.[0]?.name?.trim().slice(0, 120) ?? null,
          cover_url: item.cover?.large ?? item.cover?.medium ?? null,
          description: null,
        };
      }
    }
  } catch {
    // xalqaro bazaga ulanib boʻlmasa — shunchaki boʻsh qaytaramiz
  }

  return null;
}
