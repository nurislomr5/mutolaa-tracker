// Kirishdan keyin qaytish manzili: faqat shu saytdagi yoʻl ("//evil.com" kabi tashqi havolalar emas)
export function safeNext(next: string | null | undefined, fallback = "/javonim") {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
