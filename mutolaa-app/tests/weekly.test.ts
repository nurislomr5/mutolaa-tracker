import { describe, expect, it } from "vitest";
import { parseWeekStart, summarizeWeek, weeklySummaryDue, weekStartOf } from "@/lib/weekly";

describe("weekStartOf", () => {
  it("har qanday kun uchun oʻsha haftaning dushanbasi", () => {
    expect(weekStartOf("2026-11-09")).toBe("2026-11-09"); // dushanba
    expect(weekStartOf("2026-11-10")).toBe("2026-11-09");
    expect(weekStartOf("2026-11-15")).toBe("2026-11-09"); // yakshanba
    expect(weekStartOf("2026-11-16")).toBe("2026-11-16");
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28"); // yil chegarasi
  });
});

describe("parseWeekStart", () => {
  it("faqat haqiqiy dushanba sanasini qabul qiladi", () => {
    expect(parseWeekStart("2026-11-09")).toBe("2026-11-09");
    expect(parseWeekStart("2026-11-10")).toBeNull();
    expect(parseWeekStart("2026-02-30")).toBeNull();
    expect(parseWeekStart("2026-13-01")).toBeNull();
    expect(parseWeekStart("9-noyabr")).toBeNull();
    expect(parseWeekStart(["2026-11-09"])).toBeNull();
    expect(parseWeekStart(undefined)).toBeNull();
  });
});

describe("summarizeWeek", () => {
  const sessions = [
    { delta: 20, unit: "pages", created_at: "2026-11-09T08:00:00+05:00" },
    { delta: 15, unit: "pages", created_at: "2026-11-09T21:00:00+05:00" },
    { delta: 40, unit: "minutes", created_at: "2026-11-11T07:30:00+05:00" },
    { delta: 5, unit: "percent", created_at: "2026-11-13T10:00:00+05:00" },
    // Toshkent boʻyicha yakshanba 23:30 — UTC da hali 18:30, shu haftaga kiradi
    { delta: 10, unit: "pages", created_at: "2026-11-15T18:30:00Z" },
    // Toshkent boʻyicha dushanba 00:30 — keyingi hafta
    { delta: 99, unit: "pages", created_at: "2026-11-15T19:30:00Z" },
    // oʻtgan hafta va tuzatish (manfiy) yozuvlari hisobga kirmaydi
    { delta: 50, unit: "pages", created_at: "2026-11-08T12:00:00+05:00" },
    { delta: -8, unit: "pages", created_at: "2026-11-10T12:00:00+05:00" },
  ];

  it("betlar, daqiqalar va faol kunlarni Toshkent kunlari boʻyicha yigʻadi", () => {
    const week = summarizeWeek(sessions, "2026-11-09");
    expect(week).toMatchObject({ start: "2026-11-09", end: "2026-11-15", pages: 45, minutes: 40, activeDays: 4 });
    expect(week.days.map((d) => d.day)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
    expect(week.days[0]).toEqual({ day: "2026-11-09", sessions: 2, pages: 35, minutes: 0 });
    expect(week.days[1].sessions).toBe(0);
    expect(week.days[4]).toEqual({ day: "2026-11-13", sessions: 1, pages: 0, minutes: 0 }); // foiz — faqat faollik
    expect(week.days[6].pages).toBe(10);
  });

  it("boʻsh hafta", () => {
    expect(summarizeWeek([], "2026-11-09")).toMatchObject({ pages: 0, minutes: 0, activeDays: 0 });
  });
});

describe("weeklySummaryDue", () => {
  it("yakshanba kechqurundan dushanba tushigacha — tugagan hafta uchun", () => {
    expect(weeklySummaryDue("2026-11-15", 18, 19)).toBeNull(); // yakshanba, hali erta
    expect(weeklySummaryDue("2026-11-15", 19, 19)).toBe("2026-11-09");
    expect(weeklySummaryDue("2026-11-15", 23, 19)).toBe("2026-11-09");
    expect(weeklySummaryDue("2026-11-16", 0, 19)).toBe("2026-11-09"); // dushanba ertalab — oʻtkazib yuborilgan boʻlsa
    expect(weeklySummaryDue("2026-11-16", 11, 19)).toBe("2026-11-09");
    expect(weeklySummaryDue("2026-11-16", 12, 19)).toBeNull();
    expect(weeklySummaryDue("2026-11-12", 20, 19)).toBeNull();
  });
});
