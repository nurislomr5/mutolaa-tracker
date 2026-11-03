// Statistika uchun sof funksiyalar (server/client/bot) — barcha sanalar Toshkent vaqti boʻyicha "YYYY-MM-DD"

export const TZ = "Asia/Tashkent";

export function dayKey(value: string | Date) {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: TZ });
}

// "YYYY-MM-DD" ga n kun qoʻshish (UTC tushida hisoblaymiz — DST yoʻq, lekin ishonchli boʻlsin)
export function addDays(key: string, n: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Joriy streak (bugun yoki kechadan orqaga uzluksiz kunlar) va eng uzun streak
export function computeStreaks(days: Set<string>, today: string) {
  let current = 0;
  let cursor = days.has(today) ? today : addDays(today, -1); // bugun hali oʻqilmagan boʻlsa — kechadan sanaymiz
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...days].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest };
}

export function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
