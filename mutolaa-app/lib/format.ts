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
