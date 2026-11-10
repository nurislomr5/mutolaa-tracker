import type { SupabaseClient } from "@supabase/supabase-js";
import { FORMAT_ICON, progressLine } from "@/lib/bot/handlers";
import { appUrl, drawBar, esc, sendMessage, type InlineButton } from "@/lib/bot/telegram";
import { uz } from "@/lib/i18n/uz";
import { addDays, computeStreaks, dayKey, TZ } from "@/lib/stats-utils";
import { summarizeWeek, weeklySummaryDue, weekStartOf } from "@/lib/weekly";

// Har soatda (GitHub Actions -> /api/cron/reminders) ishlaydi. Faqat Telegram bogʻlagan foydalanuvchilarga.
// Har bir xabar turi kuniga bir marta (profiles.last_*_on), "yangi kitob" — kitob boshiga bir marta (book_notifications).

const STREAK_HOUR = 20; // streak ogohlantirish
const DIGEST_HOUR = 19; // yakshanba — haftalik natija
const NEW_BOOKS_HOUR = 10; // kuzatilgan muallif/nashriyotning yangi kitoblari
const SEND_GAP_MS = 40; // Telegram: sekundiga ~25 xabar

const t = uz.reminders;

type Profile = {
  id: string;
  display_name: string | null;
  reminder_hour: number | null;
  streak_alerts: boolean;
  weekly_digest: boolean;
  last_reminded_on: string | null;
  last_streak_alert_on: string | null;
  last_digest_on: string | null;
};

export type ReminderReport = { userId: string; kind: "daily" | "streak" | "digest" | "new_books"; text: string; sent: boolean }[];

function tashkentClock(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" }).format(now); // "Sun"
  return { hour, weekday, today: dayKey(now) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runReminders(db: SupabaseClient, opts: { now?: Date; hour?: number; dryRun?: boolean } = {}): Promise<ReminderReport> {
  const now = opts.now ?? new Date();
  const clock = tashkentClock(now);
  const hour = opts.hour ?? clock.hour;
  const { today, weekday } = clock;
  const report: ReminderReport = [];

  const { data: links } = await db.from("telegram_accounts").select("user_id, telegram_id");
  if (!links?.length) return report;
  const chatOf = new Map(links.map((l) => [l.user_id as string, l.telegram_id as number]));
  const userIds = [...chatOf.keys()];

  const [{ data: profiles }, { data: sessions }, { data: reading }] = await Promise.all([
    db
      .from("profiles")
      .select("id, display_name, reminder_hour, streak_alerts, weekly_digest, last_reminded_on, last_streak_alert_on, last_digest_on")
      .in("id", userIds),
    // streak va haftalik natija uchun oxirgi 60 kun
    db
      .from("reading_sessions")
      .select("user_id, delta, created_at, user_books!inner(unit)")
      .in("user_id", userIds)
      .gt("delta", 0)
      .gte("created_at", `${addDays(today, -60)}T00:00:00+05:00`),
    db
      .from("user_books")
      .select("user_id, format, unit, current_value, total_value, updated_at, books!inner(title, slug)")
      .in("user_id", userIds)
      .eq("status", "reading")
      .order("updated_at", { ascending: false }),
  ]);

  type Session = { user_id: string; delta: number; created_at: string; user_books: { unit: string } };
  type Reading = { user_id: string; format: string | null; unit: string; current_value: number; total_value: number | null; books: { title: string; slug: string } };
  const sessionsOf = new Map<string, Session[]>();
  for (const s of (sessions ?? []) as unknown as Session[]) sessionsOf.set(s.user_id, [...(sessionsOf.get(s.user_id) ?? []), s]);
  const readingOf = new Map<string, Reading[]>();
  for (const r of (reading ?? []) as unknown as Reading[]) readingOf.set(r.user_id, [...(readingOf.get(r.user_id) ?? []), r]);

  async function deliver(p: Profile, kind: ReminderReport[number]["kind"], text: string, keyboard: InlineButton[][], mark?: Partial<Profile>) {
    let sent = false;
    if (!opts.dryRun) {
      const res = await sendMessage(chatOf.get(p.id)!, text, keyboard);
      sent = Boolean(res.ok);
      // yuborilmasa ham (bot bloklangan) belgilaymiz — har soatda qayta urinmaslik uchun
      if (mark) await db.from("profiles").update(mark).eq("id", p.id);
      await sleep(SEND_GAP_MS);
    }
    report.push({ userId: p.id, kind, text, sent });
  }

  for (const p of (profiles ?? []) as Profile[]) {
    const userSessions = sessionsOf.get(p.id) ?? [];
    const days = new Set(userSessions.map((s) => dayKey(s.created_at)));
    const readToday = days.has(today);
    const books = readingOf.get(p.id) ?? [];
    const progress = books
      .slice(0, 3)
      .map((b) => `${FORMAT_ICON[b.format ?? "paper"]} <b>${esc(b.books.title)}</b>\n<code>${drawBar(b.current_value, b.total_value)}</code> ${esc(progressLine(b.unit, b.current_value, b.total_value))}`)
      .join("\n\n");
    const openSite: InlineButton[][] = [[{ text: uz.bot.openSite, web_app: { url: `${appUrl()}/javonim` } }]];
    let remindedNow = false;

    // 1. Kunlik eslatma — tanlangan soatda, bugun hali oʻqilmagan boʻlsa
    if (p.reminder_hour === hour && p.last_reminded_on !== today && !readToday) {
      const text = books.length ? `${t.daily(esc(books[0].books.title))}\n\n${progress}\n\n${t.replyHint}` : t.dailyNoBook;
      await deliver(p, "daily", text, openSite, { last_reminded_on: today });
      remindedNow = true;
    }

    // 2. Streak uzilay deyapti — kechgacha oʻqilmagan, streak ≥ 2
    if (hour === STREAK_HOUR && p.streak_alerts && !readToday && !remindedNow && p.last_streak_alert_on !== today) {
      const { current } = computeStreaks(days, today); // bugun oʻqilmagan — kechagacha boʻlgan streak
      if (current >= 2) await deliver(p, "streak", `${t.streak(current)}${progress ? `\n\n${progress}` : ""}`, openSite, { last_streak_alert_on: today });
    }

    // 3. Haftalik natija — yakshanba kechqurun
    if (weekday === "Sun" && hour === DIGEST_HOUR && p.weekly_digest && p.last_digest_on !== today) {
      // saytdagi /hafta sahifasi bilan bir xil hisob: dushanbadan yakshanbagacha
      const weekStart = weekStartOf(today);
      const rows = userSessions.map((s) => ({ delta: s.delta, created_at: s.created_at, unit: s.user_books.unit }));
      const week = summarizeWeek(rows, weekStart);
      const previous = summarizeWeek(rows, addDays(weekStart, -7));
      const { count: finished } = await db
        .from("user_books")
        .select("id", { count: "exact", head: true })
        .eq("user_id", p.id)
        .eq("status", "read")
        .gte("finished_at", weekStart);
      const text = week.activeDays
        ? t.digest({
            pages: week.pages,
            minutes: week.minutes,
            active: week.activeDays,
            finished: finished ?? 0,
            // oldingi haftada bet oʻqilmagan boʻlsa solishtirish maʼnosiz
            pagesDiff: previous.pages > 0 ? week.pages - previous.pages : undefined,
            streak: computeStreaks(days, today).current,
          })
        : t.digestEmpty;
      await deliver(p, "digest", text, [[{ text: uz.bot.openSite, web_app: { url: `${appUrl()}/hafta` } }]], { last_digest_on: today });
    }
  }

  // 4. Kuzatilgan muallif/nashriyotlarning yangi kitoblari (kuniga bir marta, ertalab)
  if (hour === NEW_BOOKS_HOUR) {
    const since = new Date(now.getTime() - 8 * 86_400_000).toISOString();
    const [{ data: af }, { data: pf }] = await Promise.all([
      db.from("author_follows").select("user_id, author_id, created_at").in("user_id", userIds),
      db.from("publisher_follows").select("user_id, publisher_id, created_at").in("user_id", userIds),
    ]);
    const authorIds = [...new Set((af ?? []).map((f) => f.author_id))];
    const publisherIds = [...new Set((pf ?? []).map((f) => f.publisher_id))];
    if (authorIds.length || publisherIds.length) {
      const [{ data: byAuthor }, { data: byPublisher }, { data: sent }] = await Promise.all([
        authorIds.length
          ? db
              .from("book_authors")
              .select("author_id, books!inner(id, slug, title, author_names, first_seen_at)")
              .in("author_id", authorIds)
              .gte("books.first_seen_at", since)
          : Promise.resolve({ data: [] }),
        publisherIds.length
          ? db.from("books").select("id, slug, title, author_names, publisher_id, first_seen_at").in("publisher_id", publisherIds).gte("first_seen_at", since)
          : Promise.resolve({ data: [] }),
        db.from("book_notifications").select("user_id, book_id").in("user_id", userIds),
      ]);
      type B = { id: number; slug: string; title: string; author_names: string | null; first_seen_at: string };
      const already = new Set((sent ?? []).map((s) => `${s.user_id}:${s.book_id}`));
      const perUser = new Map<string, Map<number, B>>();
      // Faqat kuzatish boshlangandan KEYIN katalogga qoʻshilgan kitoblar "yangi" — aks holda
      // birinchi ishga tushishda butun eski katalog "yangi" boʻlib ketadi
      const add = (userId: string, b: B, followedAt: string) => {
        if (already.has(`${userId}:${b.id}`) || b.first_seen_at < followedAt) return;
        perUser.set(userId, (perUser.get(userId) ?? new Map()).set(b.id, b));
      };
      for (const row of (byAuthor ?? []) as unknown as { author_id: number; books: B }[])
        for (const f of af ?? []) if (f.author_id === row.author_id) add(f.user_id, row.books, f.created_at);
      for (const b of (byPublisher ?? []) as unknown as (B & { publisher_id: number })[])
        for (const f of pf ?? []) if (f.publisher_id === b.publisher_id) add(f.user_id, b, f.created_at);

      for (const [userId, books] of perUser) {
        const list = [...books.values()].slice(0, 5);
        const text = `${t.newBooks}\n\n${list.map((b) => `📗 <a href="${appUrl()}/kitob/${b.slug}">${esc(b.title)}</a>${b.author_names ? ` — ${esc(b.author_names)}` : ""}`).join("\n")}`;
        const p = { id: userId } as Profile;
        await deliver(p, "new_books", text, []);
        if (!opts.dryRun) await db.from("book_notifications").upsert(list.map((b) => ({ user_id: userId, book_id: b.id })), { onConflict: "user_id,book_id", ignoreDuplicates: true });
      }
    }
  }

  return report;
}

// Saytdagi bildirishnomalar (20261115000017): Telegram bogʻlanganidan qatʼi nazar hamma uchun.
// Ikkala funksiya ham bazada takror yozmaydi, shuning uchun har soatda chaqirish xavfsiz.
// Xato boʻlsa (masalan, migratsiya hali qoʻllanmagan) — jurnalga yoziladi, Telegram eslatmalari toʻxtamaydi.
export async function runSiteNotifications(
  db: SupabaseClient,
  opts: { now?: Date; hour?: number; dryRun?: boolean } = {},
): Promise<{ newBooks: number | null; weekly: number | null }> {
  const result: { newBooks: number | null; weekly: number | null } = { newBooks: null, weekly: null };
  if (opts.dryRun) return result;
  const clock = tashkentClock(opts.now ?? new Date());
  const hour = opts.hour ?? clock.hour;

  const books = await db.rpc("notify_new_books");
  if (books.error) console.error("[bildirishnomalar] yangi kitoblar:", books.error.message);
  else result.newBooks = Number(books.data ?? 0);

  const weekStart = weeklySummaryDue(clock.today, hour, DIGEST_HOUR);
  if (weekStart) {
    const weekly = await db.rpc("notify_weekly_summary", { p_week_start: weekStart });
    if (weekly.error) console.error("[bildirishnomalar] haftalik xulosa:", weekly.error.message);
    else result.weekly = Number(weekly.data ?? 0);
  }
  return result;
}
