// Sayt nomi va asosiy sozlamalar shu yerda — nomni o'zgartirish uchun faqat shu faylni tahrirlang
export const site = {
  name: "Sahifa",
  description: "Oʻqigan, oʻqiyotgan va oʻqimoqchi boʻlgan kitoblaringizni oʻzbek tilida kuzating.",
  // katalog maʼlumoti manbalari (futerda koʻrsatiladi)
  sources: [
    { name: "Mutolaa", url: "https://mutolaa.com" },
    { name: "Asaxiy", url: "https://asaxiy.uz/product/knigi" },
  ],
};

// Saytning toʻliq manzili (SEO: sitemap, canonical, OG; bot havolalari). NEXT_PUBLIC_APP_URL https boʻlmasa — Vercel domeni.
export function siteUrl() {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  return raw.startsWith("https://") ? raw : "https://mutolaa-tracker.vercel.app";
}
