import { addDays, dayKey } from "@/lib/stats-utils";

// Haftalik xulosa uchun sof funksiyalar (sayt, bot va cron) — hafta dushanbadan yakshanbagacha, Toshkent vaqti boʻyicha

export type WeekSession = { delta: number; created_at: string; unit: string };
export type WeekDay = { day: string; sessions: number; pages: number; minutes: number };
export type WeekSummary = { start: string; end: string; pages: number; minutes: number; activeDays: number; days: WeekDay[] };

// 0 = dushanba … 6 = yakshanba
function weekdayIndex(day: string) {
  return (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
}

// Berilgan kun ("YYYY-MM-DD") kirgan haftaning dushanbasi
export function weekStartOf(day: string) {
  return addDays(day, -weekdayIndex(day));
}

// Manzildagi ?h= qiymati: haqiqiy sana va aynan dushanba boʻlsa — oʻsha, aks holda null
export function parseWeekStart(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  return weekdayIndex(value) === 0 ? value : null;
}

// start — dushanba. Foizda kuzatiladigan (elektron) kitoblar bet/daqiqaga kirmaydi, lekin kunni faol qiladi.
export function summarizeWeek(sessions: WeekSession[], start: string): WeekSummary {
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => ({ day: addDays(start, i), sessions: 0, pages: 0, minutes: 0 }));
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const s of sessions) {
    if (s.delta <= 0) continue;
    const day = byDay.get(dayKey(s.created_at));
    if (!day) continue;
    day.sessions++;
    if (s.unit === "pages") day.pages += s.delta;
    else if (s.unit === "minutes") day.minutes += s.delta;
  }
  return {
    start,
    end: addDays(start, 6),
    pages: days.reduce((n, d) => n + d.pages, 0),
    minutes: days.reduce((n, d) => n + d.minutes, 0),
    activeDays: days.filter((d) => d.sessions > 0).length,
    days,
  };
}

// Saytdagi "haftalik xulosa tayyor" bildirishnomasi qaysi hafta uchun yozilishi kerak (yoki null — hozir vaqti emas).
// Yakshanba kechqurundan dushanba tushigacha: soatlik cron bir-ikki marta oʻtkazib yuborsa ham xulosa yoʻqolmaydi
// (bazada takror yozilmaydi).
export function weeklySummaryDue(today: string, hour: number, digestHour: number): string | null {
  const weekday = weekdayIndex(today);
  if (weekday === 6 && hour >= digestHour) return weekStartOf(today);
  if (weekday === 0 && hour < 12) return addDays(today, -7);
  return null;
}
