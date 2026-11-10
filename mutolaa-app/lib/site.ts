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

// Saytning toʻliq manzili (SEO: sitemap, canonical, OG; bot havolalari). NEXT_PUBLIC_APP_URL https boʻlmasa — asosiy domen.
export function siteUrl() {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  return raw.startsWith("https://") ? raw : "https://xatchop.uz";
}

// Saytning eski manzillari: asosiy domen boshqa boʻlsa, shu yerga kelgan sahifa soʻrovlari oʻsha domenga koʻchiriladi
const LEGACY_HOSTS = ["mutolaa-tracker.vercel.app"];

// Soʻrov boshqa manzilga yoʻnaltirilishi kerak boʻlsa — oʻsha manzil (toʻliq yoki nisbiy), aks holda null.
//   * eski domen → asosiy domen (API'dan tashqari: bot webhook va cron eski manzilda ham ishlayveradi);
//   * /?code=… → /auth/callback: Supabase ruxsat roʻyxatida yoʻq manzil oʻrniga Site URL ildiziga qaytaradi,
//     kirish kodi yoʻqolib qolmasin (kod faqat kirish boshlangan domenda ishlaydi — u asosiy domen).
export function canonicalRedirect(method: string, host: string, path: string, search: string): string | null {
  if (method !== "GET" && method !== "HEAD") return null;
  const base = siteUrl();
  const legacy = LEGACY_HOSTS.includes(host.toLowerCase()) && new URL(base).host !== host.toLowerCase();
  if (legacy && path.startsWith("/api/")) return null;
  const target = path === "/" && new URLSearchParams(search).has("code") ? "/auth/callback" : path;
  if (!legacy && target === path) return null;
  return `${legacy ? base : ""}${target}${search}`;
}

// Sayt manzilining qisqa koʻrinishi (ulashiladigan rasmlar ostida)
export function siteHost() {
  return new URL(siteUrl()).host;
}
