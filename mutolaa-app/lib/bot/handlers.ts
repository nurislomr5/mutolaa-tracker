import type { SupabaseClient } from "@supabase/supabase-js";
import { parseIntent, type BookContext, type Intent } from "@/lib/bot/ai";
import { answerCallback, answerInlineQuery, appUrl, downloadFile, drawBar, esc, sendMessage, type InlineButton } from "@/lib/bot/telegram";
import { formatDuration } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { applyProgress, setStatusFor } from "@/lib/shelf-ops";
import { addDays, computeStreaks, dayKey } from "@/lib/stats-utils";
import { todayInTashkent, type ProgressUnit, type ReadingFormat, type ShelfStatus } from "@/lib/shelf-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLoginLink } from "@/lib/bot/login";
import { readIsbnFromImage } from "@/lib/bot/barcode";
import { fetchExternalIsbnMeta, isbnVariants } from "@/lib/isbn";
import { findBookByIsbn } from "@/lib/isbn-lookup";

// Telegram webhook mantiqi. Bot service role bilan ishlaydi — har bir soʻrov profil user_id si bilan cheklanadi.

type TgUser = { id: number; first_name?: string };
type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  voice?: { file_id: string; mime_type?: string; duration?: number };
  audio?: { file_id: string; mime_type?: string };
  // Telegram bir nechta oʻlchamni yuboradi (oxirgisi — eng kattasi); "fayl sifatida" yuborilgan rasm — document
  photo?: { file_id: string; file_size?: number; width: number; height: number }[];
  document?: { file_id: string; mime_type?: string; file_size?: number };
};
export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; from: TgUser; data?: string; message?: { chat: { id: number } } };
  inline_query?: { id: string; from: TgUser; query: string };
};

type Profile = { id: string; display_name: string | null; yearly_goal: number | null };

export const FORMAT_ICON: Record<string, string> = { paper: "📖", ebook: "📱", audio: "🎧" };
const UNIT_FOR: Record<ReadingFormat, ProgressUnit> = { paper: "pages", ebook: "percent", audio: "minutes" };

const t = uz.bot;

export function formatValue(unit: string, value: number) {
  if (unit === "minutes") return formatDuration(value * 60) ?? "0 daqiqa";
  if (unit === "percent") return `${value}%`;
  return `${value} bet`;
}

export function progressLine(unit: string, current: number, total: number | null) {
  return total ? `${formatValue(unit, current)} / ${formatValue(unit, total)}` : formatValue(unit, current);
}

const siteButton = (): InlineButton[] => [{ text: t.openSite, web_app: { url: appUrl() } }];

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function allowBotRate(key: string, limit: number, windowMs = 60_000, now = Date.now()): boolean {
  const b = rateBuckets.get(key);
  if (!b || now >= b.resetAt) {
    if (rateBuckets.size > 2000) rateBuckets.clear();
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

async function profileByTelegram(db: SupabaseClient, telegramId: number) {
  const { data: link } = await db.from("telegram_accounts").select("user_id").eq("telegram_id", telegramId).maybeSingle();
  if (!link) return null;
  const { data } = await db.from("profiles").select("id, display_name, yearly_goal").eq("id", link.user_id).maybeSingle();
  return (data as Profile | null) ?? null;
}

// ---------- Hisobni bogʻlash: /start <token> ----------

async function linkAccount(db: SupabaseClient, chatId: number, from: TgUser, token: string) {
  const { data: link } = await db
    .from("telegram_link_tokens")
    .select("user_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!link || new Date(link.expires_at) < new Date()) {
    await sendMessage(chatId, t.linkExpired, [[{ text: t.openSettings, url: `${appUrl()}/sozlamalar` }]]);
    return "link_expired";
  }
  // Bir Telegram hisobi faqat bitta profilga bogʻlanadi
  await db.from("telegram_accounts").delete().eq("telegram_id", from.id).neq("user_id", link.user_id);
  const { error } = await db
    .from("telegram_accounts")
    .upsert({ user_id: link.user_id, telegram_id: from.id, linked_at: new Date().toISOString() }, { onConflict: "user_id" });
  await db.from("telegram_link_tokens").delete().eq("user_id", link.user_id);
  if (error) {
    await sendMessage(chatId, t.error);
    return "link_failed";
  }
  await sendMessage(chatId, `${t.linked}\n\n${t.help}`, [siteButton()]);
  return "linked";
}

// ---------- Buyruqlar ----------

async function readingBooks(db: SupabaseClient, userId: string) {
  const { data } = await db
    .from("user_books")
    .select("id, status, format, unit, current_value, total_value, books!inner(id, title, author_names, audio_seconds, audio_chapters)")
    .eq("user_id", userId)
    .in("status", ["reading", "want"])
    .order("updated_at", { ascending: false })
    .limit(30);
  type Row = {
    id: number;
    status: ShelfStatus;
    format: ReadingFormat | null;
    unit: ProgressUnit;
    current_value: number;
    total_value: number | null;
    books: { id: number; title: string; author_names: string | null; audio_seconds: number | null; audio_chapters: { title: string; seconds: number }[] | null };
  };
  return (data ?? []) as unknown as Row[];
}

async function sendStatus(db: SupabaseClient, chatId: number, userId: string) {
  const reading = (await readingBooks(db, userId)).filter((b) => b.status === "reading");
  if (!reading.length) {
    await sendMessage(chatId, t.noReading, [[{ text: t.openCatalog, url: `${appUrl()}/kitoblar` }]]);
    return "status_empty";
  }
  const lines = reading.map(
    (b) =>
      `${FORMAT_ICON[b.format ?? "paper"]} <b>${esc(b.books.title)}</b>\n<code>${drawBar(b.current_value, b.total_value)}</code> ${esc(progressLine(b.unit, b.current_value, b.total_value))}`,
  );
  await sendMessage(chatId, `<b>${t.statusTitle}</b>\n\n${lines.join("\n\n")}`, [siteButton()]);
  return "status_sent";
}

async function sendQuestions(db: SupabaseClient, chatId: number, userId: string) {
  const { data } = await db
    .from("notes")
    .select("content, reference_point, user_books!inner(books!inner(title))")
    .eq("user_id", userId)
    .eq("type", "savol")
    .eq("is_resolved", false)
    .order("created_at");
  const rows = (data ?? []) as unknown as { content: string; reference_point: string | null; user_books: { books: { title: string } } }[];
  if (!rows.length) {
    await sendMessage(chatId, t.noQuestions);
    return "questions_empty";
  }
  const text = rows
    .map((q, i) => `${i + 1}. <b>${esc(q.user_books.books.title)}</b>${q.reference_point ? ` (${esc(q.reference_point)})` : ""}\n<i>${esc(q.content)}</i>`)
    .join("\n\n");
  await sendMessage(chatId, `<b>${t.questionsTitle}</b>\n\n${text}`, [[{ text: t.openNotes, url: `${appUrl()}/qaydlar?ochiq=1` }]]);
  return "questions_sent";
}

async function sendSearch(db: SupabaseClient, chatId: number, query: string) {
  const q = query.trim();
  if (!q) {
    await sendMessage(chatId, t.searchHint);
    return "search_empty_query";
  }
  const { data } = await db.rpc("search_books", { q }).select("id, title, author_names").limit(5);
  const books = (data ?? []) as { id: number; title: string; author_names: string | null }[];
  if (!books.length) {
    await sendMessage(chatId, t.searchNone(esc(q)));
    return "search_none";
  }
  const text = books.map((b, i) => `${i + 1}. <b>${esc(b.title)}</b>${b.author_names ? ` — ${esc(b.author_names)}` : ""}`).join("\n");
  const keyboard: InlineButton[][] = books.map((b, i) => [
    { text: `${i + 1}. ${t.btnReading}`, callback_data: `st:${b.id}:reading` },
    { text: `${i + 1}. ${t.btnWant}`, callback_data: `st:${b.id}:want` },
  ]);
  await sendMessage(chatId, `<b>${t.searchTitle}</b>\n\n${text}`, keyboard);
  return "search_sent";
}

// ISBN (rasmdan oʻqilgan yoki /isbn bilan yozilgan) → katalogdagi kitob va javonga qoʻshish tugmalari
async function sendIsbnResult(db: SupabaseClient, chatId: number, userId: string, raw: string) {
  const found = await findBookByIsbn(db, raw);
  if (!found) {
    await sendMessage(chatId, t.isbnInvalid(esc(raw.slice(0, 32))));
    return "isbn_invalid";
  }
  const { isbn, book } = found;
  const base = appUrl();

  if (!book) {
    const external = await fetchExternalIsbnMeta(isbn);
    const params = new URLSearchParams({ isbn });
    if (external?.title) params.set("nom", external.title);
    const lines = [t.isbnNotFound(isbn)];
    if (external?.title) lines.push(t.isbnExternal(`<b>${esc(external.title)}</b>${external.authors ? ` — ${esc(external.authors)}` : ""}`));
    await sendMessage(chatId, lines.join("\n"), [[{ text: t.isbnAdd, url: `${base}/kitob-qoshish?${params}` }]]);
    return "isbn_not_found";
  }

  const { data: mine } = await db.from("user_books").select("status").eq("user_id", userId).eq("book_id", book.id).maybeSingle();
  const lines = [t.isbnFound(isbn), "", `📖 <b>${esc(book.title)}</b>`];
  if (book.author_names) lines.push(`✍️ ${esc(book.author_names)}`);
  if (mine?.status) lines.push("", t.isbnOnShelf(uz.status[mine.status as ShelfStatus]));
  await sendMessage(chatId, lines.join("\n"), [
    [
      { text: t.btnReading, callback_data: `st:${book.id}:reading` },
      { text: t.btnWant, callback_data: `st:${book.id}:want` },
    ],
    [{ text: t.isbnOpen, url: `${base}/kitob/${book.slug}` }],
  ]);
  return "isbn_found";
}

async function handlePhoto(db: SupabaseClient, chatId: number, userId: string, fileId: string) {
  const bytes = await downloadFile(fileId);
  if (!bytes) {
    await sendMessage(chatId, t.error);
    return "photo_download_failed";
  }
  let isbn: string | null;
  try {
    isbn = await readIsbnFromImage(bytes);
  } catch (err) {
    console.error("[bot] shtrix-kod:", err);
    await sendMessage(chatId, t.error);
    return "photo_decode_error";
  }
  if (!isbn) {
    await sendMessage(chatId, t.photoNoBarcode);
    return "photo_no_barcode";
  }
  return sendIsbnResult(db, chatId, userId, isbn);
}

async function sendRecommendations(db: SupabaseClient, chatId: number, userId: string) {
  type Candidate = { id: number; slug: string; title: string; author_names: string | null; mutolaa_rating: number | null };
  const columns = "id, slug, title, author_names, mutolaa_rating";
  // Saytdagi "Siz uchun" bilan bir xil: tanlangan ruknlar, javon va kuzatilgan mualliflar asosida (20261114000016)
  const { data: personal, error } = await db.rpc("recommend_books_for", { p_user: userId, p_limit: 5 }).select(columns);
  if (error) console.error("[bot] tavsiyalar:", error.message);
  let candidates = (personal ?? []) as Candidate[];
  if (!candidates.length) {
    // Maʼlumot kam boʻlsa — javonda yoʻq eng mashhur kitoblar
    const { data: myBooks } = await db.from("user_books").select("book_id").eq("user_id", userId);
    const excludeIds = new Set((myBooks ?? []).map((r) => r.book_id as number));
    const { data } = await db.from("books").select(columns).order("mutolaa_reading_count", { ascending: false, nullsFirst: false }).limit(40);
    candidates = ((data ?? []) as Candidate[]).filter((b) => !excludeIds.has(b.id)).slice(0, 5);
  }
  if (!candidates.length) {
    await sendMessage(chatId, t.noReading);
    return "recommend_empty";
  }
  const text = candidates
    .map(
      (b, i) =>
        `${i + 1}. <b>${esc(b.title)}</b>${b.author_names ? ` — ${esc(b.author_names)}` : ""}${b.mutolaa_rating ? ` (★ ${Number(b.mutolaa_rating).toFixed(1)})` : ""}`,
    )
    .join("\n");
  const keyboard: InlineButton[][] = candidates.map((b, i) => [
    { text: `${i + 1}. ${t.btnReading}`, callback_data: `st:${b.id}:reading` },
    { text: `${i + 1}. ${t.btnWant}`, callback_data: `st:${b.id}:want` },
  ]);
  await sendMessage(chatId, `<b>✨ Siz uchun tavsiyalar:</b>\n\n${text}`, keyboard);
  return "recommend_sent";
}

async function sendStats(db: SupabaseClient, chatId: number, profile: Profile) {
  const year = todayInTashkent().slice(0, 4);
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const [{ count: readThisYear }, { count: readingNow }, { data: sessions }] = await Promise.all([
    db.from("user_books").select("id", { count: "exact", head: true }).eq("user_id", profile.id).eq("status", "read").gte("finished_at", `${year}-01-01`),
    db.from("user_books").select("id", { count: "exact", head: true }).eq("user_id", profile.id).eq("status", "reading"),
    db.from("reading_sessions").select("created_at").eq("user_id", profile.id).gt("delta", 0).gte("created_at", since),
  ]);

  // Faol kunlar (Toshkent vaqti) va ketma-ket kunlar (streak)
  const today = todayInTashkent();
  const days = new Set((sessions ?? []).map((s) => dayKey(s.created_at)));
  const { current: streak } = computeStreaks(days, today);
  const weekStart = addDays(today, -6);
  const week = [...days].filter((d) => d >= weekStart).length;

  const goal = profile.yearly_goal ? ` / ${profile.yearly_goal}\n<code>${drawBar(readThisYear ?? 0, profile.yearly_goal)}</code>` : "";
  await sendMessage(
    chatId,
    `<b>${t.statsTitle(year)}</b>\n\n✅ ${t.statsRead}: <b>${readThisYear ?? 0}</b>${goal}\n📚 ${t.statsReading}: <b>${readingNow ?? 0}</b>\n🔥 ${t.statsStreak}: <b>${streak}</b>\n📅 ${t.statsWeek}: <b>${week}/7</b>`,
    [siteButton()],
  );
  return "stats_sent";
}

// ---------- AI orqali erkin xabar ----------

function toContext(rows: Awaited<ReturnType<typeof readingBooks>>): BookContext[] {
  return rows.map((r) => {
    let start = 0;
    const chapters =
      r.format === "audio" && r.books.audio_chapters?.length
        ? r.books.audio_chapters.map((c) => {
            const item = { title: c.title, start_min: Math.round(start / 60) };
            start += c.seconds;
            return item;
          })
        : undefined;
    return {
      user_book_id: r.id,
      title: r.books.title,
      author: r.books.author_names,
      status: r.status,
      format: r.format,
      unit: r.unit,
      current: r.current_value,
      total: r.total_value,
      audio_minutes: r.books.audio_seconds ? Math.ceil(r.books.audio_seconds / 60) : null,
      ...(chapters ? { chapters } : {}),
    };
  });
}

async function suggestNext(db: SupabaseClient, userId: string): Promise<{ text: string; keyboard: InlineButton[][] }> {
  const { data } = await db
    .from("user_books")
    .select("books!inner(id, title)")
    .eq("user_id", userId)
    .eq("status", "want")
    .order("created_at")
    .limit(3);
  const books = ((data ?? []) as unknown as { books: { id: number; title: string } }[]).map((r) => r.books);
  if (!books.length) return { text: "", keyboard: [] };
  return {
    text: `\n\n${t.nextSuggestion}`,
    keyboard: books.map((b) => [{ text: `📖 ${b.title}`.slice(0, 60), callback_data: `st:${b.id}:reading` }]),
  };
}

async function handleIntent(db: SupabaseClient, chatId: number, profile: Profile, intent: Intent, rows: Awaited<ReturnType<typeof readingBooks>>) {
  if (intent.action === "ADD_BOOK") return sendSearch(db, chatId, intent.query ?? "");

  if (intent.action === "UNKNOWN") {
    await sendMessage(chatId, esc(intent.reply ?? t.help));
    return "unknown";
  }

  const row = rows.find((r) => r.id === intent.user_book_id);
  if (!row) {
    await sendMessage(chatId, t.bookNotFound);
    return "book_not_found";
  }

  if (intent.action === "NOTE") {
    if (!intent.note_content || !intent.note_type) {
      await sendMessage(chatId, t.noteEmpty);
      return "note_empty";
    }
    const { error } = await db.from("notes").insert({
      user_id: profile.id,
      user_book_id: row.id,
      type: intent.note_type,
      reference_point: intent.reference_point,
      content: intent.note_content,
    });
    if (error) {
      await sendMessage(chatId, t.error);
      return "note_failed";
    }
    await sendMessage(
      chatId,
      `✅ <b>${esc(row.books.title)}</b> — ${esc(uz.noteType[intent.note_type])}\n${intent.reference_point ? `📍 ${esc(intent.reference_point)}\n` : ""}<i>${esc(intent.note_content)}</i>`,
    );
    return "note_saved";
  }

  // PROGRESS (format almashishi ham shu yerda)
  const format = intent.format ?? row.format ?? "paper";
  const unit = intent.unit ?? (intent.format && intent.format !== row.format ? UNIT_FOR[intent.format] : row.unit);
  const audioMinutes = row.books.audio_seconds ? Math.ceil(row.books.audio_seconds / 60) : null;
  const total =
    intent.new_total ?? (unit === "percent" ? 100 : unit === row.unit ? row.total_value : unit === "minutes" ? audioMinutes : null);
  if (!total) {
    await sendMessage(chatId, t.needTotal(esc(row.books.title)));
    return "need_total";
  }
  if (intent.new_value == null) {
    await sendMessage(chatId, t.needValue);
    return "need_value";
  }
  const result = await applyProgress(db, profile.id, row.id, { format, unit, current: Math.round(intent.new_value), total: Math.round(total) }, "bot");
  if (!result) {
    await sendMessage(chatId, t.error);
    return "progress_failed";
  }
  let text = `📈 <b>${esc(row.books.title)}</b>\n<code>${drawBar(result.current, result.total)}</code> ${esc(progressLine(unit, result.current, result.total))}`;
  if (result.delta > 0) text += `\n+${esc(formatValue(unit, result.delta))}`;
  let keyboard: InlineButton[][] = [];
  if (result.finished) {
    const next = await suggestNext(db, profile.id);
    text += `\n\n${t.finished}${next.text}`;
    keyboard = next.keyboard;
  }
  await sendMessage(chatId, text, keyboard);
  return result.finished ? "progress_finished" : "progress_saved";
}

// ---------- Kirish nuqtasi ----------

export async function handleUpdate(update: TgUpdate): Promise<string> {
  const db = createAdminClient();

  // Inline qidiruv: @bot <kitob nomi>
  if (update.inline_query) {
    const iq = update.inline_query;
    const q = iq.query.trim();
    const { data } = q
      ? await db.rpc("search_books", { q }).select("id, slug, title, author_names, cover_url, mutolaa_rating").limit(10)
      : await db
          .from("books")
          .select("id, slug, title, author_names, cover_url, mutolaa_rating")
          .order("mutolaa_reading_count", { ascending: false, nullsFirst: false })
          .limit(10);
    const rows = (data ?? []) as {
      id: number;
      slug: string;
      title: string;
      author_names: string | null;
      cover_url: string | null;
      mutolaa_rating: number | null;
    }[];
    const base = appUrl();
    await answerInlineQuery(
      iq.id,
      rows.map((b) => ({
        id: String(b.id),
        title: b.title,
        description: b.author_names ?? undefined,
        thumbnail_url: b.cover_url?.startsWith("http") ? b.cover_url : undefined,
        url: `${base}/kitob/${b.slug}`,
        message_text: `📖 <b>${esc(b.title)}</b>${b.author_names ? `\n✍️ ${esc(b.author_names)}` : ""}${b.mutolaa_rating ? `\n⭐ ${Number(b.mutolaa_rating).toFixed(1)}` : ""}\n\n🔗 ${base}/kitob/${b.slug}`,
      })),
    );
    return "inline_query";
  }

  // Inline tugma: st:<bookId>:<status>
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat.id ?? cq.from.id;
    const profile = await profileByTelegram(db, cq.from.id);
    const match = cq.data?.match(/^st:(\d+):(reading|want)$/);
    if (!profile || !match) {
      await answerCallback(cq.id, profile ? undefined : t.notLinkedShort);
      return "callback_ignored";
    }
    const bookId = Number(match[1]);
    const status = match[2] as ShelfStatus;
    const result = await setStatusFor(db, profile.id, bookId, status);
    const { data: book } = await db.from("books").select("title").eq("id", bookId).maybeSingle();
    await answerCallback(cq.id, result.ok ? "✅" : t.error);
    if (result.ok) await sendMessage(chatId, `✅ <b>${esc(book?.title)}</b> — ${uz.status[status]}`);
    return result.ok ? "callback_status" : "callback_failed";
  }

  const msg = update.message;
  if (!msg?.from) return "no_message";
  const chatId = msg.chat.id;
  const text = msg.text?.trim() ?? "";

  // /start <token> — hisobni bogʻlash (bogʻlanmagan foydalanuvchi uchun ham ishlaydi)
  // /start login yoki /login — saytga kirish havolasi (hisob boʻlmasa yaratiladi)
  if (/^\/(?:start(?:@\w+)?\s+login|login(?:@\w+)?)$/.test(text)) {
    if (!allowBotRate(`login:${msg.from.id}`, 5)) {
      await sendMessage(chatId, uz.auth.rateLimit);
      return "rate_limited";
    }
    const url = await createLoginLink(db, msg.from);
    if (!url) {
      await sendMessage(chatId, t.error);
      return "login_failed";
    }
    await sendMessage(chatId, t.loginLink, [[{ text: t.loginButton, url }]]);
    return "login_link_sent";
  }

  const start = text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{16,64}))?$/);
  if (start?.[1]) return linkAccount(db, chatId, msg.from, start[1]);

  // /id — chat ID (ALERT_TELEGRAM_CHAT_ID / MY_TELEGRAM_ID sozlash uchun; menyuda koʻrsatilmaydi)
  if (/^\/id(?:@\w+)?$/.test(text)) {
    await sendMessage(chatId, `🆔 <code>${chatId}</code>`);
    return "chat_id";
  }

  const profile = await profileByTelegram(db, msg.from.id);
  if (!profile) {
    await sendMessage(chatId, t.notLinked, [[{ text: t.openSettings, url: `${appUrl()}/sozlamalar` }]]);
    return "not_linked";
  }

  const command = text.match(/^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/);
  if (command) {
    const [, name, arg] = command;
    if (name === "start" || name === "yordam" || name === "help") {
      await sendMessage(chatId, t.help, [siteButton()]);
      return "help";
    }
    if (name === "status") return sendStatus(db, chatId, profile.id);
    if (name === "savollar") return sendQuestions(db, chatId, profile.id);
    if (name === "qidir") return sendSearch(db, chatId, arg);
    if (name === "isbn") {
      if (!arg.trim()) {
        await sendMessage(chatId, t.isbnHint);
        return "isbn_hint";
      }
      return sendIsbnResult(db, chatId, profile.id, arg.trim());
    }
    if (name === "tavsiya") return sendRecommendations(db, chatId, profile.id);
    if (name === "statistika") return sendStats(db, chatId, profile);
    if (name === "eslatma") {
      // /eslatma 21 — kunlik eslatma soati (Toshkent), /eslatma off — oʻchirish
      const value = arg.trim().toLowerCase();
      const hour = /^\d{1,2}$/.test(value) && Number(value) <= 23 ? Number(value) : null;
      if (hour === null && !["off", "oʻchir", "o'chir", "ochir"].includes(value)) {
        await sendMessage(chatId, uz.reminders.botHelp);
        return "reminder_help";
      }
      await db.from("profiles").update({ reminder_hour: hour }).eq("id", profile.id);
      await sendMessage(chatId, hour === null ? uz.reminders.botOff : uz.reminders.botSet(hour));
      return hour === null ? "reminder_off" : "reminder_set";
    }
    await sendMessage(chatId, t.help);
    return "unknown_command";
  }

  // Shtrix-kod rasmi: oddiy foto yoki "fayl sifatida" yuborilgan rasm (siqilmagan — oʻqish osonroq)
  const image = msg.photo?.at(-1) ?? (msg.document?.mime_type?.startsWith("image/") ? msg.document : undefined);
  if (image) {
    if (!allowBotRate(`photo:${msg.from.id}`, 10)) {
      await sendMessage(chatId, uz.auth.rateLimit);
      return "rate_limited";
    }
    if ((image.file_size ?? 0) > 10_000_000) {
      await sendMessage(chatId, t.photoTooLarge);
      return "photo_too_large";
    }
    return handlePhoto(db, chatId, profile.id, image.file_id);
  }

  // Faqat ISBN raqamining oʻzi yozilgan boʻlsa — AI'siz toʻgʻridan-toʻgʻri qidiramiz
  if (/^[\d\s-]{9,20}[\dXx]$/.test(text) && isbnVariants(text)) return sendIsbnResult(db, chatId, profile.id, text);

  const voice = msg.voice ?? msg.audio;
  if (!voice && !text) return "unsupported";
  if (!allowBotRate(`ai:${msg.from.id}`, 12)) {
    await sendMessage(chatId, uz.auth.rateLimit);
    return "rate_limited";
  }

  const rows = await readingBooks(db, profile.id);
  let intent: Intent;
  try {
    if (voice) {
      const audio = await downloadFile(voice.file_id);
      if (!audio) throw new Error("audio yuklanmadi");
      intent = await parseIntent({ audio, mimeType: voice.mime_type ?? "audio/ogg" }, toContext(rows));
    } else {
      intent = await parseIntent({ text }, toContext(rows));
    }
  } catch {
    await sendMessage(chatId, t.aiError);
    return "ai_error";
  }
  return handleIntent(db, chatId, profile, intent, rows);
}
