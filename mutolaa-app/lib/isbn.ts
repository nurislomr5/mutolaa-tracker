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
