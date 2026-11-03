// Raqam va vaqtni oʻzbekcha koʻrinishda chiqarish

export function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} daqiqa`;
  return m === 0 ? `${h} soat` : `${h} soat ${m} daqiqa`;
}

export function formatCount(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("uz-UZ").replace(/,/g, " ");
}

export function formatRating(n: number | null | undefined): string | null {
  return n ? n.toFixed(1) : null;
}

// Server va brauzerda bir xil chiqishi uchun qatʼiy format (hydration farqi boʻlmasin): 03.11.2026
export function formatDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00+05:00` : value) : value;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric" })
    .format(d)
    .replace(/\//g, ".");
}

// "2 soat oldin" — faqat server komponentlarda (render paytidagi vaqt bilan hisoblanadi)
export function timeAgo(iso: string, now: number, t: { now: string; minutes: (n: number) => string; hours: (n: number) => string; days: (n: number) => string }) {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return t.now;
  if (minutes < 60) return t.minutes(minutes);
  if (minutes < 60 * 24) return t.hours(Math.floor(minutes / 60));
  if (minutes < 60 * 24 * 30) return t.days(Math.floor(minutes / (60 * 24)));
  return formatDate(iso);
}
