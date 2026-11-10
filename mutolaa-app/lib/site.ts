// Sayt nomi va asosiy sozlamalar shu yerda — nomni o'zgartirish uchun faqat shu faylni tahrirlang
export const site = {
  name: "Xatchoʻp",
  // lotincha, apostrofsiz shakli — fayl nomlari uchun
  slug: "xatchop",
  description: "Oʻqigan, oʻqiyotgan va oʻqimoqchi boʻlgan kitoblaringizni oʻzbek tilida kuzating.",
  // katalog maʼlumoti manbalari (futerda koʻrsatiladi)
  sources: [
    { name: "Mutolaa", url: "https://mutolaa.com" },
    { name: "Asaxiy", url: "https://asaxiy.uz/product/knigi" },
    { name: "Hilol Nashr", url: "https://hilolnashr.uz" },
  ],
  // murojaat uchun manzillar (maxfiylik va shartlar sahifalarida koʻrsatiladi); boʻsh boʻlsa — faqat «Xatoni bildirish» eslatiladi
  contacts: [
    { label: "@nurislomx", url: "https://t.me/nurislomx" },
    { label: "nurislomx.pro@gmail.com", url: "mailto:nurislomx.pro@gmail.com" },
  ] as { label: string; url: string }[],
};

// Saytning toʻliq manzili (SEO: sitemap, canonical, OG; bot havolalari). NEXT_PUBLIC_APP_URL https boʻlmasa — Vercel domeni.
export function siteUrl() {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  return raw.startsWith("https://") ? raw : "https://mutolaa-tracker.vercel.app";
}

// Sayt manzilining qisqa koʻrinishi (ulashiladigan rasmlar ostida)
export function siteHost() {
  return new URL(siteUrl()).host;
}
