import fs from "node:fs";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { beforeAll, describe, expect, it } from "vitest";
import { cleanMutolaaSlug, cleanTitle, normalizeApostrophes, saneYear, titleNoise } from "@/lib/text/clean";

// Barcha migratsiyalar Supabase'ga oʻxshash PGlite bazada qoʻllanadi, soʻng ilova bajaradigan soʻrovlar
// (PostgREST yaratadigan SQL koʻrinishida) anon / authenticated / service_role rollari bilan tekshiriladi.
// Haqiqiy bazaga hech narsa yuborilmaydi.

const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
type Role = "anon" | "authenticated" | "service_role";

let db: PGlite;

// PostgREST har soʻrovni tranzaksiya ichida "set local role" + JWT claim bilan bajaradi
function as(role: Role, sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.exec(`set local role ${role}`);
    if (sub) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
    return tx.query<Record<string, unknown>>(sql, params);
  });
}

async function expectDenied(role: Role, sub: string | null, sql: string, params: unknown[] = []) {
  await expect(as(role, sub, sql, params)).rejects.toThrow(/permission denied|row-level security/);
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema extensions; create schema auth;
    grant usage on schema auth, extensions to anon, authenticated, service_role;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public to anon, authenticated, service_role;
    -- Supabase'dagi kabi: public'dagi yangi obyektlarga avtomatik hamma huquq beriladi
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  }
  // Roʻyxatdan oʻtish: Supabase Auth auth.users ga yozadi → handle_new_user trigger profil yaratadi
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, 'a@x.test', '{"full_name":"Ali","avatar_url":"https://g/a.png"}')`,
    [A],
  );
  await db.query(`insert into auth.users (id, email) values ($1, 'b@x.test')`, [B]);
  await db.query(`insert into public.books (slug, title, source) values ('odisseya', 'Odisseya', 'mutolaa')`);
}, 60_000);

describe("migratsiyalar va ruxsatlar", () => {
  it("roʻyxatdan oʻtishda profil va avatar trigger orqali yaratiladi", async () => {
    const { rows } = await db.query<{ display_name: string; avatar_url: string }>(
      `select display_name, avatar_url from public.profiles where id = $1`,
      [A],
    );
    expect(rows[0]).toEqual({ display_name: "Ali", avatar_url: "https://g/a.png" });
  });

  it("sozlamalar: oʻz profilini oʻqiydi va saqlaydi (lib/shelf.ts, app/actions/profile.ts)", async () => {
    const own = await as("authenticated", A, `select id, username, display_name, avatar_url, yearly_goal, is_public from public.profiles where id = $1`, [A]);
    expect(own.rows).toHaveLength(1);
    const saved = await as(
      "authenticated",
      A,
      `update public.profiles set display_name = 'Ali V', username = 'ali_v', yearly_goal = 20, is_public = true where id = $1 returning 1`,
      [A],
    );
    expect(saved.rows).toHaveLength(1);
    await as("authenticated", A, `update public.profiles set reminder_hour = 21, streak_alerts = false, weekly_digest = false where id = $1`, [A]);
    const rem = await as("authenticated", A, `select * from public.my_reminder_settings()`);
    expect(rem.rows[0]).toEqual({ reminder_hour: 21, streak_alerts: false, weekly_digest: false });
  });

  it("profil: begona profil, avatar, cron ustunlari, insert/delete yopiq", async () => {
    const other = await as("authenticated", A, `update public.profiles set display_name = 'hack' where id = $1 returning 1`, [B]);
    expect(other.rows).toHaveLength(0);
    await expectDenied("authenticated", A, `update public.profiles set avatar_url = 'x' where id = $1`, [A]);
    await expectDenied("authenticated", A, `update public.profiles set last_reminded_on = now()::date where id = $1`, [A]);
    await expectDenied("authenticated", A, `insert into public.profiles (id) values ($1)`, [A]);
    await expectDenied("authenticated", A, `delete from public.profiles where id = $1`, [A]);
  });

  it("ommaviy profil: faqat ommaviy ustunlar koʻrinadi (lib/social.ts)", async () => {
    const pub = await as("anon", null, `select id, username, display_name, avatar_url, yearly_goal, is_public, created_at from public.profiles where username = 'ali_v'`);
    expect(pub.rows).toHaveLength(1);
    const hidden = await as("anon", null, `select id from public.profiles where id = $1`, [B]);
    expect(hidden.rows).toHaveLength(0);
    await expectDenied("anon", null, `select reminder_hour from public.profiles`);
    await expectDenied("anon", null, `select * from public.profiles`);
    await expectDenied("authenticated", B, `select last_digest_on from public.profiles where id = $1`, [A]);
  });

  it("katalog: foydalanuvchi yoza olmaydi, service role yozadi (add-book.ts, edit-book.ts)", async () => {
    expect((await as("anon", null, `select id from public.books`)).rows.length).toBeGreaterThan(0);
    await expectDenied("authenticated", A, `insert into public.books (slug, title, source, created_by) values ('x', 'X', 'user', $1)`, [A]);
    await expectDenied("authenticated", A, `update public.books set mutolaa_rating = 5`);
    await expectDenied("authenticated", A, `insert into public.authors (slug, name) values ('x', 'X')`);
    await expectDenied("authenticated", A, `insert into public.book_sources (book_id, source, url) select id, 'asaxiy', 'https://x' from public.books limit 1`);
    const added = await as("service_role", null, `insert into public.books (slug, title, source, created_by) values ('yangi', 'Yangi', 'user', $1) returning id`, [A]);
    expect(added.rows).toHaveLength(1);
  });

  it("javon va lenta ochiq profilda koʻrinadi", async () => {
    await as("authenticated", A, `insert into public.user_books (user_id, book_id, status) select $1, id, 'reading' from public.books where slug = 'odisseya'`, [A]);
    expect((await as("anon", null, `select status from public.user_books where user_id = $1`, [A])).rows).toHaveLength(1);
    const feed = await as("anon", null, `select a.kind, p.username from public.activities a join public.profiles p on p.id = a.user_id`);
    expect(feed.rows.length).toBeGreaterThan(0);
  });

  it("egalik: boshqa foydalanuvchi javon, qayd, sessiya va progressga tegolmaydi (app/actions/shelf.ts)", async () => {
    const ub = (await db.query<{ id: number }>(`select id from public.user_books where user_id = $1 limit 1`, [A])).rows[0].id;
    const book = (await db.query<{ id: number }>(`select id from public.books where slug = 'odisseya'`)).rows[0].id;
    const shelf = (await as("authenticated", A, `insert into public.shelves (user_id, name) values ($1, 'Sevimlilar') returning id`, [A])).rows[0].id;
    await as("authenticated", A, `insert into public.shelf_books (shelf_id, book_id) values ($1, $2)`, [shelf, book]);
    await as("authenticated", A, `insert into public.notes (user_id, user_book_id, type, content) values ($1, $2, 'iqtibos', 'Sir')`, [A, ub]);

    // addNote: B oʻz user_id si bilan, lekin A ning kitobiga
    await expectDenied("authenticated", B, `insert into public.notes (user_id, user_book_id, type, content) values ($1, $2, 'iqtibos', 'hack')`, [B, ub]);
    // B A nomidan yozolmaydi
    await expectDenied("authenticated", B, `insert into public.notes (user_id, user_book_id, type, content) values ($1, $2, 'iqtibos', 'hack')`, [A, ub]);
    await expectDenied("authenticated", B, `insert into public.reading_sessions (user_id, user_book_id, delta, new_value, source) values ($1, $2, 5, 5, 'web')`, [B, ub]);
    // toggleShelfBook: B A ning javoniga kitob qoʻsholmaydi va oʻchira olmaydi
    await expectDenied("authenticated", B, `insert into public.shelf_books (shelf_id, book_id) values ($1, $2)`, [shelf, book]);
    const removed = await as("authenticated", B, `delete from public.shelf_books where shelf_id = $1 returning 1`, [shelf]);
    expect(removed.rows).toHaveLength(0);
    // Yashirin maʼlumotlar koʻrinmaydi, oʻzgartirib boʻlmaydi
    expect((await as("authenticated", B, `select id from public.notes where user_book_id = $1`, [ub])).rows).toHaveLength(0);
    expect((await as("authenticated", B, `select id from public.shelves where id = $1`, [shelf])).rows).toHaveLength(0);
    expect((await as("authenticated", B, `select shelf_id from public.shelf_books where shelf_id = $1`, [shelf])).rows).toHaveLength(0);
    expect((await as("authenticated", B, `update public.user_books set rating = 1 where id = $1 returning 1`, [ub])).rows).toHaveLength(0);
    expect((await as("authenticated", B, `delete from public.user_books where id = $1 returning 1`, [ub])).rows).toHaveLength(0);
    expect((await as("authenticated", B, `delete from public.shelves where id = $1 returning 1`, [shelf])).rows).toHaveLength(0);
    // A ning maʼlumotlari joyida
    const left = await db.query<{ n: number }>(
      `select (select count(*) from public.shelf_books where shelf_id = $1)::int + (select count(*) from public.notes where user_book_id = $2)::int as n`,
      [shelf, ub],
    );
    expect(left.rows[0].n).toBe(2);
  });

  it("Telegram ulash: token faqat bazada yaratiladi (app/actions/telegram.ts)", async () => {
    await as("authenticated", A, `delete from public.telegram_link_tokens where user_id = $1`, [A]);
    const t = await as("authenticated", A, `insert into public.telegram_link_tokens (user_id) values ($1) returning token`, [A]);
    expect(t.rows[0].token).toMatch(/^[0-9a-f]{32}$/);
    await expectDenied("authenticated", A, `insert into public.telegram_link_tokens (user_id, token) values ($1, 'mening-tokenim')`, [A]);
    await expectDenied("authenticated", A, `insert into public.telegram_link_tokens (user_id, expires_at) values ($1, now() + interval '10 years')`, [A]);
    await expectDenied("authenticated", A, `update public.telegram_link_tokens set expires_at = now() + interval '1 year'`);
    await expectDenied("authenticated", A, `insert into public.telegram_link_tokens (user_id) values ($1)`, [B]);
  });

  it("xato xabarlari jurnali faqat service role uchun (app/actions/report-book.ts)", async () => {
    await expectDenied("anon", null, `select * from public.book_reports`);
    await expectDenied("authenticated", A, `insert into public.book_reports (user_id, book_id, message) select $1, id, 'salom' from public.books limit 1`, [A]);
    const r = await as("service_role", null, `insert into public.book_reports (user_id, book_id, message) select $1, id, 'Betlar soni xato' from public.books limit 1 returning id`, [A]);
    expect(r.rows).toHaveLength(1);
  });

  it("008: eski spoyler prefiksi va savol javobi alohida ustunlarga koʻchadi", async () => {
    const ub = (await db.query<{ id: number }>(`select id from public.user_books where user_id = $1 limit 1`, [A])).rows[0].id;
    await db.query(`update public.user_books set review = $2, review_is_spoiler = false where id = $1`, [ub, "[spoiler]\nOxirida Kumush vafot etadi\n"]);
    const legacy = await db.query<{ id: number }>(
      `insert into public.notes (user_id, user_book_id, type, content) values
         ($1, $2, 'savol', $3), ($1, $2, 'savol', $4), ($1, $2, 'iqtibos', $5) returning id`,
      [A, ub, "Nega Otabek Margʻilonga bordi?\n\n💡 Javob: Savdo ishlari bilan", "Javobsiz savol\n\n💡 Javob:   ", "Oddiy iqtibos"],
    );
    await db.exec(`alter table public.user_books disable trigger user_books_set_updated_at`);
    await db.query(`update public.user_books set updated_at = '2026-01-15T10:00:00Z' where id = $1`, [ub]);
    await db.exec(`alter table public.user_books enable trigger user_books_set_updated_at`);
    const migration = fs.readdirSync(MIGRATIONS).find((f) => f.endsWith("_review_spoiler_note_answer.sql"))!;
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, migration), "utf8"));
    // sana oʻzgarmadi (updated_at trigger koʻchirish vaqtida oʻchirilgan), keyin yana yoqilgan
    const kept = await db.query<{ updated_at: Date }>(`select updated_at from public.user_books where id = $1`, [ub]);
    expect(kept.rows[0].updated_at.toISOString()).toBe("2026-01-15T10:00:00.000Z");

    const review = await db.query(`select review, review_is_spoiler from public.user_books where id = $1`, [ub]);
    expect(review.rows[0]).toEqual({ review: "Oxirida Kumush vafot etadi", review_is_spoiler: true });
    const notes = await db.query(`select content, answer from public.notes where id = any($1) order by id`, [legacy.rows.map((r) => r.id)]);
    expect(notes.rows).toEqual([
      { content: "Nega Otabek Margʻilonga bordi?", answer: "Savdo ishlari bilan" },
      { content: "Javobsiz savol", answer: null },
      { content: "Oddiy iqtibos", answer: null },
    ]);

    // Ikkinchi marta ishga tushirish hech narsani buzmaydi
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, migration), "utf8"));
    expect((await db.query(`select review, review_is_spoiler from public.user_books where id = $1`, [ub])).rows[0]).toEqual(review.rows[0]);

    // Yangi ustunlar: egasi yozadi, mehmon ochiq profilda spoyler belgisini koʻradi, begona yozolmaydi
    await as("authenticated", A, `update public.user_books set review_is_spoiler = false where id = $1`, [ub]);
    const bumped = await db.query<{ updated_at: Date }>(`select updated_at from public.user_books where id = $1`, [ub]);
    expect(bumped.rows[0].updated_at.toISOString()).not.toBe("2026-01-15T10:00:00.000Z"); // trigger yana yoqilgan
    expect((await as("anon", null, `select review_is_spoiler from public.user_books where id = $1`, [ub])).rows).toEqual([{ review_is_spoiler: false }]);
    expect((await as("authenticated", B, `update public.user_books set review_is_spoiler = true where id = $1 returning 1`, [ub])).rows).toHaveLength(0);
    const answered = await as("authenticated", A, `update public.notes set answer = 'Yangi javob', is_resolved = true where id = $1 returning id`, [legacy.rows[1].id]);
    expect(answered.rows).toHaveLength(1);
    expect((await as("authenticated", B, `update public.notes set answer = 'hack' where id = $1 returning id`, [legacy.rows[1].id])).rows).toHaveLength(0);
  });

  it("006 va 007 qayta ishga tushirilsa ham xato bermaydi", async () => {
    for (const f of fs.readdirSync(MIGRATIONS).filter((f) => /_(security_lockdown|book_reports)\.sql$/.test(f))) {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
    }
    await expectDenied("anon", null, `select reminder_hour from public.profiles`);
  });
});

describe("20261109000009: katalog filtrlari va yillik statistika", () => {
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    await db.exec(`
      insert into public.publishers (name, slug) values ('Alfa', 'alfa'), ('Beta', 'beta');
      insert into public.books (slug, title, source, formats, mutolaa_reading_count, publisher_id) values
        ('filtr-bir', 'Filtr bir', 'mutolaa', '{audio}', 300, null),
        ('filtr-ikki', 'Filtr ikki', 'asaxiy', '{paper}', 200, (select id from public.publishers where slug = 'alfa')),
        ('filtr-uch', 'Filtr uch', 'asaxiy', '{paper}', 100, (select id from public.publishers where slug = 'alfa'));
    `);
    for (const r of (await db.query<{ id: number; slug: string }>(`select id, slug from public.books where slug like 'filtr-%'`)).rows) ids[r.slug] = r.id;
    // filtr-uch ning asosiy nashriyoti Alfa, lekin Beta'da ham ruscha nashri bor (sotuvda)
    await db.query(
      `insert into public.book_sources (book_id, source, external_id, url, publisher_id, language, in_stock) values
         ($1, 'mutolaa', 'm1', 'https://m/1', null, null, null),
         ($2, 'asaxiy', 'a2', 'https://a/2', (select id from public.publishers where slug = 'alfa'), 'o''zb/rus', false),
         ($3, 'asaxiy', 'a3', 'https://a/3', (select id from public.publishers where slug = 'alfa'), 'uz', false),
         ($3, 'asaxiy', 'a4', 'https://a/4', (select id from public.publishers where slug = 'beta'), 'ru', true)`,
      [ids["filtr-bir"], ids["filtr-ikki"], ids["filtr-uch"]],
    );
  });

  it("til yozuvlari toifalarga ajraladi", async () => {
    const cases: [string, string | null, string[]][] = [
      ["mutolaa", null, ["uz"]],
      ["asaxiy", null, []],
      ["asaxiy", "uz", ["uz"]],
      ["asaxiy", "o'zb/rus", ["ru", "uz"]],
      ["asaxiy", "узб/рус/англ", ["en", "ru", "uz"]],
      ["asaxiy", "uzb/english", ["en", "uz"]],
      ["asaxiy", "ingliz / o‘zbek", ["en", "uz"]],
      ["asaxiy", "o'zbekcha / yaponcha", ["other", "uz"]],
      ["asaxiy", "английский/русский", ["en", "ru"]],
      ["asaxiy", "kaa", ["other"]],
      ["asaxiy", "tr", ["other"]],
      ["asaxiy", "rus", ["ru"]],
    ];
    for (const [source, language, expected] of cases) {
      const { rows } = await db.query<{ l: string[] }>(`select public.source_langs($1, $2) as l`, [source, language]);
      expect(rows[0].l, `${source}: ${language}`).toEqual(expected);
    }
  });

  const slugs = async (sql: string, params: unknown[] = []) =>
    (await as("anon", null, `select slug from ${sql}`, params)).rows.map((r) => r.slug);

  it("search_catalog: filtrsiz — search_books bilan bir xil tartib (mashhurlik)", async () => {
    expect(await slugs(`public.search_catalog('filtr')`)).toEqual(["filtr-bir", "filtr-ikki", "filtr-uch"]);
    expect(await slugs(`public.search_books('filtr')`)).toEqual(["filtr-bir", "filtr-ikki", "filtr-uch"]);
  });

  it("search_catalog: nashriyot — kitobning oʻzi yoki nashri orqali", async () => {
    expect(await slugs(`public.search_catalog('filtr', 'alfa')`)).toEqual(["filtr-ikki", "filtr-uch"]);
    expect(await slugs(`public.search_catalog('filtr', 'beta')`)).toEqual(["filtr-uch"]);
    expect(await slugs(`public.search_catalog('filtr', 'yoq')`)).toEqual([]);
  });

  it("search_catalog: til va sotuvda bor (bitta nashr boʻyicha)", async () => {
    expect(await slugs(`public.search_catalog('filtr', null, 'uz')`)).toEqual(["filtr-bir", "filtr-ikki", "filtr-uch"]);
    expect(await slugs(`public.search_catalog('filtr', null, 'ru')`)).toEqual(["filtr-ikki", "filtr-uch"]);
    expect(await slugs(`public.search_catalog('filtr', null, 'en')`)).toEqual([]);
    expect(await slugs(`public.search_catalog('filtr', null, null, true)`)).toEqual(["filtr-uch"]);
    // filtr-ikki ruscha, lekin sotuvda emas; filtr-uch ning oʻzbekcha nashri sotuvda emas
    expect(await slugs(`public.search_catalog('filtr', null, 'ru', true)`)).toEqual(["filtr-uch"]);
    expect(await slugs(`public.search_catalog('filtr', null, 'uz', true)`)).toEqual([]);
    expect(await slugs(`public.search_catalog('filtr', 'alfa', 'ru', true)`)).toEqual(["filtr-uch"]);
  });

  it("publisher_book_counts: takrorsiz sanaydi, oʻzbekcha kitoblar alohida", async () => {
    const { rows } = await as(
      "anon",
      null,
      `select slug, count::int as n, uz_count::int as uz from public.publisher_book_counts() where slug in ('alfa', 'beta') order by slug`,
    );
    // Beta'dagi yagona nashr ruscha
    expect(rows).toEqual([
      { slug: "alfa", n: 2, uz: 2 },
      { slug: "beta", n: 1, uz: 0 },
    ]);
  });

  it("get_user_year_stats: Toshkent vaqti boʻyicha kunlar, betlar va daqiqalar; faqat oʻziniki", async () => {
    const year = Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" }).slice(0, 4));
    const pagesUb = (await db.query<{ id: number }>(`select id from public.user_books where user_id = $1 limit 1`, [A])).rows[0].id;
    await db.query(`update public.user_books set unit = 'pages' where id = $1`, [pagesUb]);
    const audioUb = (
      await db.query<{ id: number }>(`insert into public.user_books (user_id, book_id, status, unit) values ($1, $2, 'reading', 'minutes') returning id`, [A, ids["filtr-bir"]])
    ).rows[0].id;
    await db.query(
      `insert into public.reading_sessions (user_id, user_book_id, delta, new_value, source, created_at) values
         ($1, $2, 20, 20, 'web', $4),   -- UTC 20:00 → Toshkentda ertasi kun
         ($1, $2, 10, 30, 'web', $5),
         ($1, $2, -5, 25, 'web', $5),   -- manfiy (orqaga) hisoblanmaydi
         ($1, $3, 45, 45, 'web', $5),
         ($1, $2, 99, 99, 'web', $6)    -- oʻtgan yil: bu yil statistikasiga kirmaydi`,
      [A, pagesUb, audioUb, `${year}-03-01T20:00:00Z`, `${year}-03-02T08:00:00Z`, `${year - 1}-06-01T08:00:00Z`],
    );

    const { rows } = await as("authenticated", A, `select public.get_user_year_stats($1) as s`, [year]);
    const s = rows[0].s as { activity: Record<string, number>; pages: number; minutes: number };
    expect(s.activity[`${year}-03-02`]).toBe(3);
    expect(s.activity[`${year}-03-01`]).toBeUndefined();
    expect(s.pages).toBe(30);
    expect(s.minutes).toBe(45);

    const past = (await as("authenticated", A, `select public.get_user_year_stats($1) as s`, [year - 1])).rows[0].s as typeof s;
    expect(past).toEqual({ activity: { [`${year - 1}-06-01`]: 1 }, pages: 99, minutes: 0 });

    const other = (await as("authenticated", B, `select public.get_user_year_stats($1) as s`, [year])).rows[0].s;
    expect(other).toEqual({ activity: {}, pages: 0, minutes: 0 });
    await expectDenied("anon", null, `select public.get_user_year_stats($1)`, [year]);
  });

  it("009 qayta ishga tushirilsa ham xato bermaydi", async () => {
    const f = fs.readdirSync(MIGRATIONS).find((f) => f.endsWith("_catalog_filters_year_stats.sql"))!;
    // publisher_book_counts keyinroq (20261116000019) uz_count ustuni bilan qayta yaratilgan —
    // 009 ning eski koʻrinishi uning ustiga yozila olmaydi, shuning uchun avval olib tashlanadi, soʻng qaytariladi
    const later = fs.readFileSync(path.join(MIGRATIONS, "20261116000019_catalog_cleanup.sql"), "utf8");
    const recreate = later.slice(later.indexOf("drop function if exists public.publisher_book_counts();"));
    await db.exec("drop function public.publisher_book_counts();");
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
    await db.exec(recreate);
    expect(await slugs(`public.search_catalog('filtr', 'beta')`)).toEqual(["filtr-uch"]);
    expect((await as("anon", null, `select uz_count::int as uz from public.publisher_book_counts() where slug = 'alfa'`)).rows).toEqual([{ uz: 2 }]);
  });
});

describe("20261109000010: Hilol importeri kitob yarata oladi", () => {
  it("books.source = 'hilol' ruxsat etilgan, notoʻgʻri manba esa yoʻq", async () => {
    const ok = await as("service_role", null, `insert into public.books (slug, title, source, formats) values ('hilol-sinov', 'Sinov', 'hilol', '{paper}') returning id`);
    expect(ok.rows).toHaveLength(1);
    await expect(as("service_role", null, `insert into public.books (slug, title, source) values ('x-sinov', 'X', 'boshqa')`)).rejects.toThrow(/books_source_check/);
  });
});

describe("20261110000011: takroriy kitoblarni birlashtirish", () => {
  const q1 = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  let T: number, S: number, ubA_t: number, ubA_s: number;

  beforeAll(async () => {
    [{ id: T }] = await q1<{ id: number }>(
      `insert into public.books (slug, title, author_names, source, formats, mutolaa_id) values ('t-kitob', 'Virtual olam bolalari', null, 'mutolaa', '{audio}', 500) returning id`,
    );
    [{ id: S }] = await q1<{ id: number }>(
      `insert into public.books (slug, title, author_names, source, formats, cover_url, isbn, page_count)
       values ('s-kitob', 'Виртуал олам болалари (кирилл)', 'Абдулкарим Ҳасан', 'asaxiy', '{paper}', 'https://c/s.jpg', '978-9910-273-91-9', 176) returning id`,
    );
    const [{ id: author }] = await q1<{ id: number }>(`insert into public.authors (slug, name) values ('abdulkarim-hasan', 'Abdulkarim Hasan') returning id`);
    await q1(`insert into public.book_authors (book_id, author_id, position) values ($1, $2, 0)`, [S, author]);
    await q1(`insert into public.book_sources (book_id, source, external_id, url) values ($1, 'asaxiy', 'vob', 'https://a/vob')`, [S]);
    await q1(`insert into public.book_redirects (old_slug, book_id) values ('eski-eski', $1)`, [S]);

    // A: ikkala nusxa (T — oʻqimoqchi, S — oʻqigan, baho, spoylerli taqriz, qayd, sessiya); B: faqat S
    [{ id: ubA_t }] = await q1<{ id: number }>(`insert into public.user_books (user_id, book_id, status) values ($1, $2, 'want') returning id`, [A, T]);
    [{ id: ubA_s }] = await q1<{ id: number }>(
      `insert into public.user_books (user_id, book_id, status, current_value, total_value, rating, review, review_is_spoiler, finished_at)
       values ($1, $2, 'read', 176, 176, 4, 'Zoʻr', true, '2026-10-01') returning id`,
      [A, S],
    );
    await q1(`insert into public.user_books (user_id, book_id, status) values ($1, $2, 'reading')`, [B, S]);
    await q1(`insert into public.notes (user_id, user_book_id, type, content) values ($1, $2, 'iqtibos', 'Sevimli joy')`, [A, ubA_s]);
    await q1(`insert into public.reading_sessions (user_id, user_book_id, delta, new_value, source) values ($1, $2, 176, 176, 'web')`, [A, ubA_s]);
    const [{ id: shelfA }] = await q1<{ id: number }>(`insert into public.shelves (user_id, name) values ($1, 'Birlashtirish') returning id`, [A]);
    await q1(`insert into public.shelf_books (shelf_id, book_id) values ($1, $2), ($1, $3)`, [shelfA, T, S]);
    await q1(`insert into public.book_notifications (user_id, book_id) values ($1, $2), ($1, $3)`, [A, T, S]);
    await q1(`insert into public.book_reports (user_id, book_id, message) values ($1, $2, 'Takror kitob')`, [B, S]);
  });

  it("nom kaliti lotin/kirill va qavsdagi izohni tenglashtiradi, raqamli izohni saqlaydi", async () => {
    const [r] = await q1<{ a: string; b: string; c: string; d: string }>(
      `select public.book_title_key('Виртуал олам болалари (кирилл)') a, public.book_title_key('Virtual olam bolalari (lotincha)') b,
              public.book_title_key('Siyrati nabaviya (1-juz)') c, public.book_title_key('Siyrati nabaviya (2-juz)') d`,
    );
    expect(r.a).toBe(r.b);
    expect(r.c).not.toBe(r.d);
  });

  it("nomzodlar: nom boʻyicha juftlik topiladi, 'takror emas' belgilangani chiqmaydi", async () => {
    const pairs = await q1<{ book_a: number; book_b: number; reason: string }>(`select * from public.book_duplicate_candidates(500)`);
    expect(pairs).toContainEqual({ book_a: T, book_b: S, reason: "nom" });
    await q1(`insert into public.book_duplicate_dismissals (book_a, book_b) values ($1, $2)`, [T, S]);
    const after = await q1<{ book_a: number; book_b: number }>(`select * from public.book_duplicate_candidates(500)`);
    expect(after.some((p) => p.book_a === T && p.book_b === S)).toBe(false);
  });

  it("faqat service role chaqira oladi, admin belgisi foydalanuvchiga yopiq", async () => {
    await expectDenied("authenticated", A, `select public.merge_books($1, $2)`, [T, S]);
    await expectDenied("anon", null, `select * from public.book_duplicate_candidates(10)`);
    await expectDenied("authenticated", A, `select is_admin from public.profiles where id = $1`, [A]);
    await expectDenied("authenticated", A, `update public.profiles set is_admin = true where id = $1`, [A]);
  });

  it("Mutolaa kitobi ikkinchisiga qoʻshilmaydi (teskari yoʻnalish rad etiladi)", async () => {
    await expect(as("service_role", null, `select public.merge_books($1, $2)`, [S, T])).rejects.toThrow(/Mutolaa/);
    expect(await q1(`select id from public.books where id in ($1, $2)`, [T, S])).toHaveLength(2);
  });

  it("birlashtiradi: javon, qayd, sessiya, javonlar, lenta, xabarlar, nashrlar va yoʻnaltirishlar koʻchadi", async () => {
    const before = (await q1<{ n: number }>(`select count(*)::int n from public.activities where book_id in ($1, $2)`, [T, S]))[0].n;
    const res = (await as("service_role", null, `select public.merge_books($1, $2) as r`, [T, S])).rows[0].r as Record<string, unknown>;
    expect(res).toMatchObject({ target: T, source: S, moved_users: 1, merged_users: 1, source_slug: "s-kitob" });

    expect(await q1(`select id from public.books where id = $1`, [S])).toHaveLength(0);
    const [book] = await q1(`select cover_url, isbn, page_count, formats, author_names, mutolaa_id from public.books where id = $1`, [T]);
    expect(book).toEqual({
      cover_url: "https://c/s.jpg",
      isbn: "978-9910-273-91-9",
      page_count: 176,
      formats: ["audio", "paper"],
      author_names: "Абдулкарим Ҳасан",
      mutolaa_id: 500,
    });
    expect(await q1(`select position from public.book_authors where book_id = $1`, [T])).toHaveLength(1);
    expect(await q1(`select source from public.book_sources where book_id = $1`, [T])).toEqual([{ source: "asaxiy" }]);

    // A: bitta yozuv; oʻqigan nusxa asos (holat, baho, spoylerli taqriz); qayd va sessiya saqlangan
    const ubs = await q1(
      `select id, status, rating::text, review, review_is_spoiler, finished_at::text from public.user_books where user_id = $1 and book_id = $2`,
      [A, T],
    );
    expect(ubs).toEqual([{ id: ubA_t, status: "read", rating: "4.0", review: "Zoʻr", review_is_spoiler: true, finished_at: "2026-10-01" }]);
    expect(await q1(`select content from public.notes where user_book_id = $1`, [ubA_t])).toEqual([{ content: "Sevimli joy" }]);
    expect(await q1(`select delta from public.reading_sessions where user_book_id = $1`, [ubA_t])).toEqual([{ delta: 176 }]);
    expect(await q1(`select status from public.user_books where user_id = $1 and book_id = $2`, [B, T])).toEqual([{ status: "reading" }]);

    expect(
      await q1(`select book_id from public.shelf_books where shelf_id in (select id from public.shelves where name = 'Birlashtirish')`),
    ).toEqual([{ book_id: T }]);
    expect((await q1<{ n: number }>(`select count(*)::int n from public.book_notifications where book_id = $1 and user_id = $2`, [T, A]))[0].n).toBe(1);
    expect(await q1(`select book_id from public.book_reports where message = 'Takror kitob'`)).toEqual([{ book_id: T }]);
    // Birlashtirish lentaga yangi yozuv qoʻshmaydi
    expect((await q1<{ n: number }>(`select count(*)::int n from public.activities where book_id = $1`, [T]))[0].n).toBe(before);

    expect(await q1(`select old_slug, book_id from public.book_redirects where book_id = $1 order by old_slug`, [T])).toEqual([
      { old_slug: "eski-eski", book_id: T },
      { old_slug: "s-kitob", book_id: T },
    ]);
    expect((await as("anon", null, `select book_id from public.book_redirects where old_slug = 's-kitob'`)).rows).toEqual([{ book_id: T }]);

    // Triggerlar qayta yoqilgan: keyingi oʻzgarish lentaga tushadi (bir soat ichidagi holatlar bitta yozuvga almashadi)
    await q1(`update public.user_books set status = 'read' where user_id = $1 and book_id = $2`, [B, T]);
    expect(await q1(`select kind from public.activities where user_id = $1 and book_id = $2 order by id desc limit 1`, [B, T])).toEqual([{ kind: "read" }]);
  });

  it("notoʻgʻri juftlik rad etiladi", async () => {
    await expect(as("service_role", null, `select public.merge_books($1, $1)`, [T])).rejects.toThrow(/juftlik/);
    await expect(as("service_role", null, `select public.merge_books($1, 999999)`, [T])).rejects.toThrow(/topilmadi/);
  });
});

describe("20261110000012: taqrizlarga 'Foydali' ovozi", () => {
  const q1 = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  const C = "00000000-0000-0000-0000-00000000000c";
  let book: number, reviewA: number, reviewB: number;
  const counts = async (bookId: number) =>
    (await as("anon", null, `select user_book_id, helpful from public.review_helpful_counts($1) order by user_book_id`, [bookId])).rows;

  beforeAll(async () => {
    await db.query(`insert into auth.users (id, email) values ($1, 'c@x.test')`, [C]);
    [{ id: book }] = await q1<{ id: number }>(`insert into public.books (slug, title, source) values ('ovoz-kitob', 'Ovoz', 'mutolaa') returning id`);
    // A — ochiq profil (oldingi testlarda), B — yopiq profil
    [{ id: reviewA }] = await q1<{ id: number }>(
      `insert into public.user_books (user_id, book_id, status, review) values ($1, $2, 'read', 'Juda foydali kitob') returning id`,
      [A, book],
    );
    [{ id: reviewB }] = await q1<{ id: number }>(
      `insert into public.user_books (user_id, book_id, status, review) values ($1, $2, 'read', 'Yopiq profil taqrizi') returning id`,
      [B, book],
    );
  });

  it("boshqa odamning ochiq taqriziga ovoz beradi; ikki marta, oʻziga va yopiq profilga — yoʻq", async () => {
    await as("authenticated", B, `insert into public.review_votes (user_book_id) values ($1)`, [reviewA]);
    await as("authenticated", C, `insert into public.review_votes (user_book_id) values ($1)`, [reviewA]);
    await expect(as("authenticated", B, `insert into public.review_votes (user_book_id) values ($1)`, [reviewA])).rejects.toThrow(/duplicate key/);
    await expectDenied("authenticated", A, `insert into public.review_votes (user_book_id) values ($1)`, [reviewA]);
    await expectDenied("authenticated", A, `insert into public.review_votes (user_book_id) values ($1)`, [reviewB]);
    await expectDenied("authenticated", B, `insert into public.review_votes (user_id, user_book_id) values ($1, $2)`, [C, reviewA]);
    await expectDenied("anon", null, `insert into public.review_votes (user_book_id) values ($1)`, [reviewA]);
    expect(await counts(book)).toEqual([{ user_book_id: reviewA, helpful: 2 }]);
  });

  it("kim ovoz bergani yashirin: har kim faqat oʻz ovozini koʻradi", async () => {
    expect((await as("authenticated", B, `select user_book_id from public.review_votes`)).rows).toEqual([{ user_book_id: reviewA }]);
    expect((await as("authenticated", A, `select user_book_id from public.review_votes`)).rows).toEqual([]);
    await expectDenied("anon", null, `select * from public.review_votes`);
  });

  it("ovozni qaytarib olish faqat oʻziniki", async () => {
    expect((await as("authenticated", A, `delete from public.review_votes where user_book_id = $1 returning 1`, [reviewA])).rows).toHaveLength(0);
    expect((await as("authenticated", C, `delete from public.review_votes where user_book_id = $1 returning 1`, [reviewA])).rows).toHaveLength(1);
    expect(await counts(book)).toEqual([{ user_book_id: reviewA, helpful: 1 }]);
  });

  it("birlashtirishda ovozlar asosiy kitobdagi oʻsha taqriz bilan koʻchadi", async () => {
    const [{ id: target }] = await q1<{ id: number }>(`insert into public.books (slug, title, source) values ('ovoz-asosiy', 'Ovoz', 'mutolaa') returning id`);
    // A ning asosiy nusxasida taqriz yoʻq, takror nusxasida (book) taqriz va B ning ovozi bor
    await q1(`insert into public.user_books (user_id, book_id, status) values ($1, $2, 'want')`, [A, target]);
    await as("service_role", null, `select public.merge_books($1, $2)`, [target, book]);
    const [{ id: kept }] = await q1<{ id: number }>(`select id from public.user_books where user_id = $1 and book_id = $2`, [A, target]);
    expect(await q1(`select review from public.user_books where id = $1`, [kept])).toEqual([{ review: "Juda foydali kitob" }]);
    expect(await counts(target)).toEqual([{ user_book_id: kept, helpful: 1 }]);
  });
});

describe("20261111000013: kitobxonlik klublari", () => {
  const q1 = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  const C = "00000000-0000-0000-0000-00000000000c"; // oldingi blokda yaratilgan
  const rpc = async (role: Role, sub: string | null, sql: string, params: unknown[] = []) => (await as(role, sub, sql, params)).rows;
  let openSlug: string, privSlug: string, openId: number, privId: number, book: number;

  beforeAll(async () => {
    [{ id: book }] = await q1<{ id: number }>(`insert into public.books (slug, title, source) values ('klub-kitobi', 'Klub kitobi', 'mutolaa') returning id`);
    openSlug = (await rpc("authenticated", A, `select public.create_club('Kitob sevarlar', 'Har oy bitta kitob', true) as s`))[0].s as string;
    privSlug = (await rpc("authenticated", A, `select public.create_club('Kitob sevarlar', null, false) as s`))[0].s as string;
    [{ id: openId }] = await q1<{ id: number }>(`select id from public.clubs where slug = $1`, [openSlug]);
    [{ id: privId }] = await q1<{ id: number }>(`select id from public.clubs where slug = $1`, [privSlug]);
  });

  it("ochadi: slug nomdan, takrorlansa raqam bilan; yaratuvchi — boshqaruvchi; kuniga 3 tadan koʻp emas", async () => {
    expect(openSlug).toBe("kitob-sevarlar");
    expect(privSlug).toBe("kitob-sevarlar-2");
    expect(await q1(`select role from public.club_members where club_id = $1`, [openId])).toEqual([{ role: "owner" }]);
    await rpc("authenticated", A, `select public.create_club('Uchinchi klub', null, true)`);
    await expect(as("authenticated", A, `select public.create_club('Toʻrtinchi klub', null, true)`)).rejects.toThrow(/kunlik cheklov/);
    await expectDenied("anon", null, `select public.create_club('Mehmon klubi', null, true)`);
    await expectDenied("authenticated", A, `insert into public.clubs (slug, name, owner_id) values ('x', 'Xxx', $1)`, [A]);
  });

  it("ochiq klub hammaga koʻrinadi, yopigʻi — faqat aʼzolarga; taklif kodi faqat egasiga", async () => {
    expect((await rpc("anon", null, `select name, is_owner, invite_code from public.club_page($1)`, [openSlug]))[0]).toEqual({ name: "Kitob sevarlar", is_owner: false, invite_code: null });
    expect(await rpc("anon", null, `select id from public.club_page($1)`, [privSlug])).toEqual([]);
    expect(await rpc("authenticated", B, `select id from public.clubs where id = $1`, [privId])).toEqual([]);
    const dir = (await rpc("anon", null, `select slug from public.club_directory(false, 50)`)).map((r) => r.slug);
    expect(dir).toContain(openSlug);
    expect(dir).not.toContain(privSlug);
    await expectDenied("anon", null, `select invite_code from public.clubs`);
    const owner = (await rpc("authenticated", A, `select is_owner, invite_code from public.club_page($1)`, [privSlug]))[0];
    expect(owner.is_owner).toBe(true);
    expect(String(owner.invite_code)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("qoʻshilish: ochiq klubga toʻgʻridan-toʻgʻri, yopiqqa faqat taklif kodi bilan", async () => {
    await as("authenticated", B, `insert into public.club_members (club_id) values ($1)`, [openId]);
    await expectDenied("authenticated", B, `insert into public.club_members (club_id) values ($1)`, [privId]);
    await expectDenied("authenticated", B, `insert into public.club_members (club_id, role) values ($1, 'owner')`, [openId]);
    const [{ invite_code: code }] = await q1<{ invite_code: string }>(`select invite_code from public.clubs where id = $1`, [privId]);
    expect((await rpc("authenticated", C, `select * from public.club_by_invite($1)`, [code]))[0]).toMatchObject({ name: "Kitob sevarlar", member_count: 1, is_member: false });
    expect((await rpc("authenticated", C, `select public.join_club_by_code($1) as s`, [code]))[0].s).toBe(privSlug);
    expect((await rpc("authenticated", C, `select is_member from public.club_page($1)`, [privSlug]))[0].is_member).toBe(true);
    expect((await rpc("authenticated", C, `select public.join_club_by_code('notogri') as s`))[0].s).toBeNull();
    // kod yangilansa eski havola ishlamaydi
    await rpc("authenticated", A, `select public.reset_club_invite($1)`, [privId]);
    expect((await rpc("authenticated", B, `select public.join_club_by_code($1) as s`, [code]))[0].s).toBeNull();
  });

  it("muhokama: faqat aʼzo yozadi, javob bir darajali; muallif yoki egasi oʻchiradi", async () => {
    const [{ id: post }] = await rpc("authenticated", B, `insert into public.club_posts (club_id, body) values ($1, 'Birinchi bob ajoyib') returning id`, [openId]) as { id: number }[];
    const [{ id: reply }] = await rpc("authenticated", A, `insert into public.club_posts (club_id, parent_id, body) values ($1, $2, 'Qoʻshilaman') returning id`, [openId, post]) as { id: number }[];
    await expectDenied("authenticated", C, `insert into public.club_posts (club_id, body) values ($1, 'Aʼzo emasman')`, [openId]);
    await expectDenied("authenticated", A, `insert into public.club_posts (club_id, parent_id, body) values ($1, $2, 'Javobga javob')`, [openId, reply]);
    await expectDenied("authenticated", B, `insert into public.club_posts (club_id, user_id, body) values ($1, $2, 'Boshqa nomidan')`, [openId, A]);

    const feed = await rpc("anon", null, `select id, parent_id, body, display_name, username, can_delete from public.club_feed($1, 50)`, [openId]);
    expect(feed).toEqual([
      { id: post, parent_id: null, body: "Birinchi bob ajoyib", display_name: "Kitobxon", username: null, can_delete: false },
      { id: reply, parent_id: post, body: "Qoʻshilaman", display_name: "Ali V", username: "ali_v", can_delete: false },
    ]);
    expect(await rpc("anon", null, `select id from public.club_feed($1, 50)`, [privId])).toEqual([]);
    expect((await rpc("authenticated", C, `delete from public.club_posts where id = $1 returning 1`, [post]))).toHaveLength(0);
    expect((await rpc("authenticated", A, `delete from public.club_posts where id = $1 returning 1`, [post]))).toHaveLength(1);
    expect(await q1(`select id from public.club_posts where id in ($1, $2)`, [post, reply])).toEqual([]); // javob ham
  });

  it("joriy kitob va aʼzolar progressi; egasi chiqib keta olmaydi, aʼzoni chiqara oladi", async () => {
    expect(await rpc("authenticated", B, `update public.clubs set name = 'Buzilgan' where id = $1 returning 1`, [openId])).toHaveLength(0);
    expect(await rpc("authenticated", B, `update public.clubs set current_book_id = $2 where id = $1 returning 1`, [openId, book])).toHaveLength(0);
    await rpc("authenticated", A, `update public.clubs set current_book_id = $2 where id = $1`, [openId, book]);
    await q1(`insert into public.user_books (user_id, book_id, status, unit, current_value, total_value) values ($1, $2, 'reading', 'pages', 50, 200)`, [B, book]);
    const members = await rpc("anon", null, `select role, status, current_value, total_value from public.club_members_view($1)`, [openId]);
    expect(members).toEqual([
      { role: "owner", status: null, current_value: null, total_value: null },
      { role: "member", status: "reading", current_value: 50, total_value: 200 },
    ]);
    expect(await rpc("anon", null, `select user_id from public.club_members_view($1)`, [privId])).toEqual([]);

    expect(await rpc("authenticated", A, `delete from public.club_members where club_id = $1 and user_id = $2 returning 1`, [openId, A])).toHaveLength(0);
    expect(await rpc("authenticated", A, `delete from public.club_members where club_id = $1 and user_id = $2 returning 1`, [openId, B])).toHaveLength(1);
  });

  it("joriy kitob takror sifatida birlashtirilsa klub asosiy kitobga oʻtadi", async () => {
    const [{ id: main }] = await q1<{ id: number }>(`insert into public.books (slug, title, source) values ('klub-asosiy', 'Klub kitobi', 'mutolaa') returning id`);
    await as("service_role", null, `select public.merge_books($1, $2)`, [main, book]);
    expect(await q1(`select current_book_id from public.clubs where id = $1`, [openId])).toEqual([{ current_book_id: main }]);
  });
});

describe("20261112000014: shikoyatlar navbati va admin paneli", () => {
  const q1 = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  const C = "00000000-0000-0000-0000-00000000000c"; // oldingi bloklarda yaratilgan
  const INSERT = `insert into public.content_reports (reporter_id, target_type, target_id, target_user_id, reason, message, snapshot)
    values ($1, $2, $3, $4, $5, $6, 'nusxa') returning id, status`;
  const report = (reporter: string, type: string, targetId: number | null, author: string, reason = "spam", message: string | null = null) =>
    as("service_role", null, INSERT, [reporter, type, targetId, author, reason, message]);
  let review: number;

  beforeAll(async () => {
    const [{ id: book }] = await q1<{ id: number }>(`insert into public.books (slug, title, source) values ('shikoyat-kitob', 'Shikoyat', 'mutolaa') returning id`);
    [{ id: review }] = await q1<{ id: number }>(
      `insert into public.user_books (user_id, book_id, status, review) values ($1, $2, 'read', 'Reklama: arzon kitoblar!') returning id`,
      [A, book],
    );
  });

  it("navbat faqat service role uchun (app/actions/reports.ts, lib/admin-panel.ts)", async () => {
    await expectDenied("anon", null, `select * from public.content_reports`);
    await expectDenied("authenticated", B, `select * from public.content_reports`);
    await expectDenied("authenticated", B, INSERT, [B, "review", review, A, "spam", null]);
    await expectDenied("authenticated", A, `update public.content_reports set status = 'dismissed'`);
    await expectDenied("authenticated", A, `delete from public.content_reports`);
    const { rows } = await report(B, "review", review, A, "spam", "Reklama tarqatyapti");
    expect(rows).toEqual([{ id: expect.any(Number), status: "open" }]);
  });

  it("bir odam bitta narsa ustidan koʻrib chiqilguncha bir marta shikoyat qiladi", async () => {
    await expect(report(B, "review", review, A, "abuse")).rejects.toThrow(/content_reports_once_idx/);
    // boshqa odam — mumkin; profil ustidan (target_id boʻsh) ham xuddi shunday bir marta
    expect((await report(C, "review", review, A)).rows).toHaveLength(1);
    expect((await report(B, "profile", null, A)).rows).toHaveLength(1);
    await expect(report(B, "profile", null, A, "other")).rejects.toThrow(/content_reports_once_idx/);
    // admin yopgach (admin-reports.ts) oʻsha odam yana shikoyat qila oladi
    await as("service_role", null, `update public.content_reports set status = 'dismissed', resolved_at = now() where target_type = 'review' and target_id = $1`, [review]);
    expect((await report(B, "review", review, A)).rows).toHaveLength(1);
  });

  it("notoʻgʻri shikoyat rad etiladi: tur, sabab, uzun izoh, nishon idsi", async () => {
    await expect(report(C, "book", 1, A)).rejects.toThrow(/check constraint/);
    await expect(report(C, "club_post", 1, A, "yoqmadi")).rejects.toThrow(/check constraint/);
    await expect(report(C, "club_post", 1, A, "spam", "x".repeat(501))).rejects.toThrow(/check constraint/);
    await expect(report(C, "club_post", null, A)).rejects.toThrow(/check constraint/);
    await expect(report(C, "profile", 5, A)).rejects.toThrow(/check constraint/);
  });

  it("katalog xatosi haqidagi xabar 'hal qilindi' deb belgilanadi", async () => {
    const [{ id }] = await q1<{ id: number }>(
      `insert into public.book_reports (user_id, book_id, message) select $1, id, 'Muallif xato' from public.books where slug = 'shikoyat-kitob' returning id`,
      [B],
    );
    expect(await q1(`select resolved_at from public.book_reports where id = $1`, [id])).toEqual([{ resolved_at: null }]);
    await expectDenied("authenticated", B, `update public.book_reports set resolved_at = now() where id = $1`, [id]);
    const done = await as("service_role", null, `update public.book_reports set resolved_at = now() where id = $1 and resolved_at is null returning id`, [id]);
    expect(done.rows).toHaveLength(1);
  });

  it("admin_stats: faqat service role; sonlar bazadagiga mos, 14 kunlik roʻyxat", async () => {
    await expectDenied("anon", null, `select public.admin_stats()`);
    await expectDenied("authenticated", A, `select public.admin_stats()`);
    const s = (await as("service_role", null, `select public.admin_stats() as s`)).rows[0].s as Record<string, number> & {
      signups_by_day: { day: string; count: number }[];
    };
    const count = async (sql: string) => Number((await q1<{ n: number }>(`select count(*) as n from ${sql}`))[0].n);
    expect(s.users_total).toBe(await count(`public.profiles`));
    expect(s.users_7d).toBe(s.users_total);
    expect(s.public_profiles).toBe(await count(`public.profiles where is_public`));
    expect(s.books_total).toBe(await count(`public.books`));
    expect(s.books_user_total).toBe(await count(`public.books where source = 'user'`));
    expect(s.shelf_total).toBe(await count(`public.user_books`));
    expect(s.reviews_total).toBe(await count(`public.user_books where review is not null`));
    expect(s.clubs_total).toBe(await count(`public.clubs`));
    expect(s.reports_open).toBe(await count(`public.content_reports where status = 'open'`));
    expect(s.reports_open).toBe(2);
    expect(s.book_reports_open).toBe(await count(`public.book_reports where resolved_at is null`));
    // kamida A — shu blokda javoniga kitob qoʻshgan
    expect(s.active_7d).toBeGreaterThanOrEqual(1);
    expect(s.active_30d).toBeGreaterThanOrEqual(s.active_7d);
    for (const key of ["users_30d", "telegram_linked", "books_user_7d", "shelf_7d", "notes_total", "sessions_7d", "club_posts_7d"]) {
      expect(typeof s[key], key).toBe("number");
    }
    expect(s.signups_by_day).toHaveLength(14);
    expect(s.signups_by_day.map((d) => d.day)).toEqual([...s.signups_by_day.map((d) => d.day)].sort());
    // hamma test foydalanuvchilari bugun (Toshkent vaqti bilan) roʻyxatdan oʻtgan
    expect(s.signups_by_day.at(-1)!.count).toBe(s.users_total);
    expect(s.signups_by_day.slice(0, -1).every((d) => d.count === 0)).toBe(true);
  });

  it("014 qayta ishga tushirilsa ham xato bermaydi va huquqlar ochilib qolmaydi", async () => {
    const f = fs.readdirSync(MIGRATIONS).find((f) => f.endsWith("_moderation_admin.sql"))!;
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
    await expectDenied("authenticated", A, `select * from public.content_reports`);
    await expectDenied("authenticated", A, `select public.admin_stats()`);
    expect(await q1(`select count(*)::int as n from public.content_reports where status = 'open'`)).toEqual([{ n: 2 }]);
  });
});

describe("20261114000016: tanishuv, tavsiyalar va oʻxshash kitoblar", () => {
  const q1 = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  const E = "00000000-0000-0000-0000-00000000000e";
  const book: Record<string, number> = {};
  const topic: Record<string, number> = {};
  const slugs = (rows: Record<string, unknown>[]) => rows.map((r) => r.slug);

  beforeAll(async () => {
    await q1(`insert into auth.users (id, email) values ($1, 'e@x.test')`, [E]);
    await db.exec(`
      insert into public.topics (name, slug) values ('Fantastika', 'tv-fantastika'), ('Badiiy', 'tv-badiiy'), ('Sport', 'tv-sport');
      insert into public.genres (name, slug) values ('Qoʻllanma', 'tv-qollanma');
      insert into public.authors (slug, name) values ('tv-muallif', 'Tavsiya Muallif'), ('tv-boshqa', 'Boshqa Muallif');
      insert into public.books (slug, title, source, mutolaa_reading_count) values
        ('tv-asos', 'Asos', 'mutolaa', 10),
        ('tv-yaqin', 'Yaqin', 'mutolaa', 5),
        ('tv-uzoq', 'Uzoq', 'mutolaa', 900),
        ('tv-muallifdosh', 'Muallifdosh', 'mutolaa', 50),
        ('tv-sport', 'Sport kitobi', 'mutolaa', 1),
        ('tv-ruknsiz', 'Ruknsiz', 'asaxiy', 1000);
    `);
    for (const r of await q1<{ id: number; slug: string }>(`select id, slug from public.books where slug like 'tv-%'`)) book[r.slug] = r.id;
    for (const r of await q1<{ id: number; slug: string }>(`select id, slug from public.topics where slug like 'tv-%'`)) topic[r.slug] = r.id;
    // Fantastika — kam uchraydi (3 kitob), Badiiy — deyarli hammasida (4 kitob)
    await db.exec(`
      insert into public.book_topics (book_id, topic_id)
        select b.id, t.id from public.books b, public.topics t
        where (t.slug = 'tv-fantastika' and b.slug in ('tv-asos', 'tv-yaqin', 'tv-muallifdosh'))
           or (t.slug = 'tv-badiiy' and b.slug in ('tv-asos', 'tv-yaqin', 'tv-muallifdosh', 'tv-uzoq'))
           or (t.slug = 'tv-sport' and b.slug = 'tv-sport');
      insert into public.book_genres (book_id, genre_id)
        select b.id, g.id from public.books b, public.genres g where g.slug = 'tv-qollanma' and b.slug in ('tv-sport', 'tv-uzoq');
      insert into public.book_authors (book_id, author_id)
        select b.id, a.id from public.books b, public.authors a
        where (a.slug = 'tv-muallif' and b.slug in ('tv-asos', 'tv-muallifdosh')) or (a.slug = 'tv-boshqa' and b.slug = 'tv-ruknsiz');
    `);
  });

  it("similar_books: kam uchraydigan rukn mosligi ustun, shu muallifning kitobi chiqmaydi; mehmonga ham ochiq", async () => {
    const SQL = `select slug from public.similar_books($1, $2)`;
    // "Uzoq" ancha mashhur, lekin faqat keng tarqalgan rukni mos — pastda turadi
    expect(slugs((await as("anon", null, SQL, [book["tv-asos"], 12])).rows)).toEqual(["tv-yaqin", "tv-uzoq"]);
    expect(slugs((await as("authenticated", B, SQL, [book["tv-asos"], 1])).rows)).toEqual(["tv-yaqin"]);
    // janr orqali ham topiladi; rukni ham, janri ham yoʻq kitobda — boʻsh
    expect(slugs((await as("anon", null, SQL, [book["tv-sport"], 12])).rows)).toEqual(["tv-uzoq"]);
    expect((await as("anon", null, SQL, [book["tv-ruknsiz"], 12])).rows).toEqual([]);
  });

  it("tanishuv holati yopiq ustunda: faqat my_onboarding / save_onboarding orqali", async () => {
    await expectDenied("anon", null, `select * from public.my_onboarding()`);
    await expectDenied("anon", null, `select public.save_onboarding('{}'::bigint[], null)`);
    await expectDenied("authenticated", E, `select onboarded_at from public.profiles where id = $1`, [E]);
    await expectDenied("authenticated", E, `update public.profiles set onboarded_at = now() where id = $1`, [E]);
    await expectDenied("authenticated", E, `insert into public.profile_topics (user_id, topic_id) values ($1, $2)`, [E, topic["tv-sport"]]);
    await expectDenied("anon", null, `select * from public.profile_topics`);
    expect((await as("authenticated", E, `select * from public.my_onboarding()`)).rows).toEqual([{ onboarded: false, topic_ids: [] }]);
  });

  it("save_onboarding: ruknlar almashtiriladi, yoʻq rukn tashlab ketiladi, maqsad faqat toʻgʻri boʻlsa yoziladi", async () => {
    await as("authenticated", E, `select public.save_onboarding($1::bigint[], 24)`, [[topic["tv-fantastika"], topic["tv-sport"], 999999]]);
    expect((await as("authenticated", E, `select * from public.my_onboarding()`)).rows).toEqual([
      { onboarded: true, topic_ids: [topic["tv-fantastika"], topic["tv-sport"]].sort((a, b) => a - b) },
    ]);
    expect(await q1(`select yearly_goal from public.profiles where id = $1`, [E])).toEqual([{ yearly_goal: 24 }]);
    // qayta saqlash: roʻyxat toʻliq almashadi; 0 yoki boʻsh maqsad eskisini oʻzgartirmaydi
    await as("authenticated", E, `select public.save_onboarding($1::bigint[], 0)`, [[topic["tv-fantastika"]]]);
    await as("authenticated", E, `select public.save_onboarding($1::bigint[], null)`, [[topic["tv-fantastika"]]]);
    expect((await as("authenticated", E, `select topic_id from public.profile_topics`)).rows).toEqual([{ topic_id: topic["tv-fantastika"] }]);
    expect(await q1(`select yearly_goal from public.profiles where id = $1`, [E])).toEqual([{ yearly_goal: 24 }]);
    // boshqa odam uning tanlovini koʻrmaydi
    expect((await as("authenticated", B, `select topic_id from public.profile_topics`)).rows).toEqual([]);
    await expect(as("authenticated", E, `select public.save_onboarding($1::bigint[], null)`, [Array.from({ length: 41 }, (_, i) => i + 1)])).rejects.toThrow(/Juda koʻp/);
  });

  it("recommended_books: tanlangan rukn → javondagi kitoblar → kuzatilgan muallif; javondagilar chiqmaydi", async () => {
    const SQL = `select slug from public.recommended_books(12)`;
    await expectDenied("anon", null, SQL);
    await expectDenied("authenticated", E, `select slug from public.recommend_books_for($1, 12)`, [E]);
    // hech qanday maʼlumot yoʻq foydalanuvchiga — boʻsh (ilova mashhur kitoblarni koʻrsatadi)
    expect((await as("authenticated", B, SQL)).rows).toEqual([]);
    // faqat tanlangan rukn: Fantastika kitoblari, mashhurlik boʻyicha
    expect(slugs((await as("authenticated", E, SQL)).rows)).toEqual(["tv-muallifdosh", "tv-asos", "tv-yaqin"]);
    // "Asos"ni oʻqib 5 baho qoʻydi: u roʻyxatdan chiqadi, uning ruknlari ("Badiiy" ham) hisobga kiradi
    await q1(`insert into public.user_books (user_id, book_id, status, rating) values ($1, $2, 'read', 5)`, [E, book["tv-asos"]]);
    expect(slugs((await as("authenticated", E, SQL)).rows)).toEqual(["tv-muallifdosh", "tv-yaqin", "tv-uzoq"]);
    // kuzatilgan muallifning ruknsiz (qogʻoz) kitobi ham tavsiyaga kiradi
    await q1(`insert into public.author_follows (user_id, author_id) select $1, id from public.authors where slug = 'tv-boshqa'`, [E]);
    expect(slugs((await as("authenticated", E, SQL)).rows)).toEqual(["tv-muallifdosh", "tv-yaqin", "tv-ruknsiz", "tv-uzoq"]);
    // bot (lib/bot/handlers.ts) service role bilan
    expect(slugs((await as("service_role", null, `select slug from public.recommend_books_for($1, 2)`, [E])).rows)).toEqual(["tv-muallifdosh", "tv-yaqin"]);
  });

  it("016 qayta ishga tushirilsa: xato yoʻq, huquqlar yopiq, javoni bor eski foydalanuvchi tanishuvdan oʻtgan hisoblanadi", async () => {
    expect((await as("authenticated", A, `select onboarded from public.my_onboarding()`)).rows).toEqual([{ onboarded: false }]);
    const F = "00000000-0000-0000-0000-00000000000f";
    await q1(`insert into auth.users (id, email) values ($1, 'f@x.test')`, [F]);
    const f = fs.readdirSync(MIGRATIONS).find((f) => f.endsWith("_onboarding_recommendations.sql"))!;
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
    expect((await as("authenticated", A, `select onboarded from public.my_onboarding()`)).rows).toEqual([{ onboarded: true }]);
    // javoni boʻsh foydalanuvchi — hali oʻtmagan
    expect((await as("authenticated", F, `select onboarded from public.my_onboarding()`)).rows).toEqual([{ onboarded: false }]);
    expect((await as("authenticated", E, `select topic_id from public.profile_topics`)).rows).toHaveLength(1);
    await expectDenied("anon", null, `select * from public.recommended_books(12)`);
    await expectDenied("authenticated", E, `delete from public.profile_topics`);
  });
});

describe("20261115000017: bildirishnomalar va haftalik xulosa", () => {
  const q1 = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  const G = "00000000-0000-0000-0000-0000000000a1"; // ochiq profil — bildirishnoma oluvchi
  const H = "00000000-0000-0000-0000-0000000000a2"; // yopiq profil
  const I = "00000000-0000-0000-0000-0000000000a3"; // ochiq profil
  let book: number, review: number, club: number, clubSlug: string;
  const list = async (user: string, columns = "kind, unread, n, actor_name, actor_username, book_slug, club_slug") =>
    (await as("authenticated", user, `select ${columns} from public.my_notifications()`)).rows;
  const unread = async (user: string) => (await as("authenticated", user, `select public.unread_notifications_count() as n`)).rows[0].n;

  beforeAll(async () => {
    await q1(
      `insert into auth.users (id, email, raw_user_meta_data) values
         ($1, 'g@x.test', '{"full_name":"Gulnoza"}'), ($2, 'h@x.test', '{"full_name":"Hasan"}'), ($3, 'i@x.test', '{"full_name":"Ilhom"}')`,
      [G, H, I],
    );
    await q1(`update public.profiles set username = 'gulnoza', is_public = true where id = $1`, [G]);
    await q1(`update public.profiles set username = 'ilhom', is_public = true where id = $1`, [I]);
    [{ id: book }] = await q1<{ id: number }>(`insert into public.books (slug, title, source) values ('bn-kitob', 'Bildirishnoma kitobi', 'mutolaa') returning id`);
    [{ id: review }] = await q1<{ id: number }>(
      `insert into public.user_books (user_id, book_id, status, review) values ($1, $2, 'read', 'Oʻqishga arziydi') returning id`,
      [G, book],
    );
  });

  it("yangi kuzatuvchi: profili ochiq boʻlsa ismi koʻrinadi, yopiq boʻlsa — yoʻq; qayta kuzatish takrorlamaydi", async () => {
    await as("authenticated", H, `insert into public.follows (following_id) values ($1)`, [G]);
    await as("authenticated", I, `insert into public.follows (following_id) values ($1)`, [G]);
    await as("authenticated", I, `delete from public.follows where following_id = $1`, [G]);
    await as("authenticated", I, `insert into public.follows (following_id) values ($1)`, [G]);
    expect(await list(G, "kind, unread, n, actor_name, actor_username")).toEqual([
      { kind: "follow", unread: true, n: 1, actor_name: "Ilhom", actor_username: "ilhom" },
      { kind: "follow", unread: true, n: 1, actor_name: null, actor_username: null },
    ]);
    expect(await unread(G)).toBe(2);
    expect(await list(H)).toEqual([]);
  });

  it("jadval toʻliq yopiq: faqat funksiyalar orqali, mehmonga ular ham yopiq", async () => {
    await expectDenied("authenticated", G, `select * from public.notifications`);
    await expectDenied("authenticated", G, `insert into public.notifications (user_id, kind) values ($1, 'weekly')`, [H]);
    await expectDenied("authenticated", G, `update public.notifications set read_at = null`);
    await expectDenied("anon", null, `select * from public.notifications`);
    await expectDenied("anon", null, `select * from public.my_notifications()`);
    await expectDenied("anon", null, `select public.unread_notifications_count()`);
    await expectDenied("anon", null, `select public.mark_notifications_read()`);
    await expectDenied("authenticated", G, `select public.notify_new_books()`);
    await expectDenied("authenticated", G, `select public.notify_weekly_summary('2025-06-02')`);
  });

  it("'Foydali' ovozi: kim bergani aytilmaydi, bir kunlik ovozlar bittaga yigʻiladi", async () => {
    await as("authenticated", H, `insert into public.review_votes (user_book_id) values ($1)`, [review]);
    await as("authenticated", I, `insert into public.review_votes (user_book_id) values ($1)`, [review]);
    // ovozni qaytarib olib yana berish yangi bildirishnoma yaratmaydi
    await as("authenticated", I, `delete from public.review_votes where user_book_id = $1`, [review]);
    await as("authenticated", I, `insert into public.review_votes (user_book_id) values ($1)`, [review]);
    const rows = await list(G, "kind, n, actor_name, actor_username, actor_avatar, book_slug, book_title");
    expect(rows[0]).toEqual({ kind: "helpful", n: 2, actor_name: null, actor_username: null, actor_avatar: null, book_slug: "bn-kitob", book_title: "Bildirishnoma kitobi" });
    expect(rows).toHaveLength(3);
    expect(await unread(G)).toBe(3);
  });

  it("oʻqildi deb belgilash faqat oʻzinikiga taʼsir qiladi", async () => {
    await as("authenticated", H, `select public.mark_notifications_read()`);
    expect(await unread(G)).toBe(3);
    await as("authenticated", G, `select public.mark_notifications_read()`);
    expect(await unread(G)).toBe(0);
    expect((await list(G, "unread")).every((r) => r.unread === false)).toBe(true);
  });

  it("klub: yangi mavzu aʼzolarga (kun boʻyicha yigʻiladi), javob — muallifiga ismi bilan; chiqib ketganda tozalanadi", async () => {
    clubSlug = (await as("authenticated", G, `select public.create_club('Bildirishnoma klubi', null, true) as s`)).rows[0].s as string;
    [{ id: club }] = await q1<{ id: number }>(`select id from public.clubs where slug = $1`, [clubSlug]);
    await as("authenticated", H, `insert into public.club_members (club_id) values ($1)`, [club]);
    await as("authenticated", I, `insert into public.club_members (club_id) values ($1)`, [club]);
    const post = (await as("authenticated", G, `insert into public.club_posts (club_id, body) values ($1, 'Birinchi mavzu') returning id`, [club])).rows[0].id;
    await as("authenticated", G, `insert into public.club_posts (club_id, body) values ($1, 'Ikkinchi mavzu')`, [club]);
    expect(await list(H)).toEqual([{ kind: "club_post", unread: true, n: 2, actor_name: null, actor_username: null, book_slug: null, club_slug: clubSlug }]);
    expect(await unread(H)).toBe(1);
    expect(await list(G)).toHaveLength(3); // oʻz xabari haqida oʻziga yozilmaydi

    // yopiq profilli aʼzoning javobi: ismi koʻrinadi (klub ichida), profil havolasi yoʻq
    const reply = (await as("authenticated", H, `insert into public.club_posts (club_id, parent_id, body) values ($1, $2, 'Qoʻshilaman') returning id`, [club, post])).rows[0].id;
    expect((await list(G, "kind, unread, actor_name, actor_username, club_slug, post_id"))[0]).toEqual({
      kind: "club_reply", unread: true, actor_name: "Hasan", actor_username: null, club_slug: clubSlug, post_id: reply,
    });
    expect(await list(I, "kind, n")).toEqual([{ kind: "club_post", n: 2 }]); // javob boshqa aʼzolarga yuborilmaydi

    // javob oʻchsa — bildirishnomasi ham; aʼzo chiqsa — klubga oid bildirishnomalari ham
    await as("authenticated", H, `delete from public.club_posts where id = $1`, [reply]);
    expect((await list(G)).map((r) => r.kind)).not.toContain("club_reply");
    await as("authenticated", H, `delete from public.club_members where club_id = $1 and user_id = $2`, [club, H]);
    expect(await list(H)).toEqual([]);
    expect(await q1(`select 1 from public.notifications where user_id = $1`, [H])).toEqual([]);
    // klub oʻchsa — qolgan aʼzolarniki ham
    await as("authenticated", G, `delete from public.clubs where id = $1`, [club]);
    expect(await list(I)).toEqual([]);
    expect(await q1(`select 1 from public.notifications where club_id = $1`, [club])).toEqual([]);
  });

  it("notify_new_books: faqat kuzatish boshlangandan keyin qoʻshilgan kitob, bir marta; oʻzi qoʻshgani — yoʻq", async () => {
    await db.exec(`
      insert into public.authors (slug, name) values ('bn-muallif', 'Bildirishnoma Muallif');
      insert into public.publishers (slug, name) values ('bn-nashriyot', 'Bildirishnoma nashriyoti');
      insert into public.books (slug, title, source, first_seen_at) values ('bn-eski', 'Eski kitob', 'mutolaa', now() - interval '2 days');
      insert into public.book_authors (book_id, author_id)
        select b.id, a.id from public.books b, public.authors a where b.slug = 'bn-eski' and a.slug = 'bn-muallif';
    `);
    await as("authenticated", G, `insert into public.author_follows (author_id) select id from public.authors where slug = 'bn-muallif'`);
    await as("authenticated", G, `insert into public.publisher_follows (publisher_id) select id from public.publishers where slug = 'bn-nashriyot'`);
    await as("authenticated", I, `insert into public.publisher_follows (publisher_id) select id from public.publishers where slug = 'bn-nashriyot'`);
    expect((await as("service_role", null, `select public.notify_new_books() as n`)).rows[0].n).toBe(0);

    // bitta kitob ham muallif, ham nashriyot orqali mos keladi — baribir bitta bildirishnoma
    await db.query(
      `insert into public.books (slug, title, source, publisher_id, created_by)
       select 'bn-yangi', 'Yangi kitob', 'user', p.id, $1 from public.publishers p where p.slug = 'bn-nashriyot'`,
      [I],
    );
    await db.exec(`
      insert into public.book_authors (book_id, author_id)
        select b.id, a.id from public.books b, public.authors a where b.slug = 'bn-yangi' and a.slug = 'bn-muallif';
    `);
    expect((await as("service_role", null, `select public.notify_new_books() as n`)).rows[0].n).toBe(1);
    expect((await as("service_role", null, `select public.notify_new_books() as n`)).rows[0].n).toBe(0);
    expect((await list(G, "kind, unread, n, book_slug, book_title"))[0]).toEqual({ kind: "new_book", unread: true, n: 1, book_slug: "bn-yangi", book_title: "Yangi kitob" });
    expect(await list(I)).toEqual([]); // kitobni oʻzi qoʻshgan
  });

  it("notify_weekly_summary: shu haftada (Toshkent vaqti, dushanba–yakshanba) oʻqiganlarga, bir marta", async () => {
    const [{ id: ubI }] = await q1<{ id: number }>(`insert into public.user_books (user_id, book_id, status) values ($1, $2, 'reading') returning id`, [I, book]);
    await q1(
      `insert into public.reading_sessions (user_id, user_book_id, delta, new_value, created_at) values
         ($1, $2, 10, 10, '2025-06-08T23:30:00+05:00'),
         ($3, $4, 10, 10, '2025-06-09T00:30:00+05:00')`,
      [G, review, I, ubI],
    );
    expect((await as("service_role", null, `select public.notify_weekly_summary('2025-06-02') as n`)).rows[0].n).toBe(1);
    expect((await as("service_role", null, `select public.notify_weekly_summary('2025-06-02') as n`)).rows[0].n).toBe(0);
    expect((await list(G, "kind, unread, ref_date::text as week"))[0]).toEqual({ kind: "weekly", unread: true, week: "2025-06-02" });
    expect(await list(I)).toEqual([]);
    expect(await unread(G)).toBe(2);
  });

  it("017 qayta ishga tushirilsa: xato yoʻq, huquqlar yopiq, triggerlar ikkilanmaydi", async () => {
    const f = fs.readdirSync(MIGRATIONS).find((f) => f.endsWith("_notifications.sql"))!;
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
    await expectDenied("authenticated", G, `select * from public.notifications`);
    await expectDenied("anon", null, `select * from public.my_notifications()`);
    await expectDenied("authenticated", G, `select public.notify_new_books()`);
    await as("authenticated", G, `insert into public.follows (following_id) values ($1)`, [I]);
    expect(await list(I, "kind, n, actor_name")).toEqual([{ kind: "follow", n: 1, actor_name: "Gulnoza" }]);
    expect(await q1(`select 1 from public.notifications where user_id = $1`, [I])).toHaveLength(1);
  });
});

// app/actions/account.ts: Supabase Auth auth.users dagi yozuvni oʻchiradi — qolgani shu zanjir bilan oʻchishi shart.
// Yangi jadval foydalanuvchiga "on delete cascade"siz bogʻlansa, hisobni oʻchirish xato beradi — bu test shuni ushlaydi.
describe("hisobni oʻchirish: auth.users oʻchsa hamma shaxsiy maʼlumot oʻchadi", () => {
  const q1 = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  const D = "00000000-0000-0000-0000-00000000000d";
  let book: number, reviewA: number, reviewD: number, ownClub: number, otherClub: number;

  beforeAll(async () => {
    await q1(`insert into auth.users (id, email) values ($1, 'd@x.test')`, [D]);
    [{ id: book }] = await q1<{ id: number }>(
      `insert into public.books (slug, title, source, created_by) values ('ketuvchi-kitobi', 'Ketuvchi qoʻshgan kitob', 'user', $1) returning id`,
      [D],
    );
    // javon, progress, qayd, shaxsiy javon, taqriz (lenta yozuvi trigger orqali)
    [{ id: reviewD }] = await q1<{ id: number }>(
      `insert into public.user_books (user_id, book_id, status, rating, review) values ($1, $2, 'read', 5, 'Zoʻr kitob') returning id`,
      [D, book],
    );
    await q1(`insert into public.reading_sessions (user_id, user_book_id, delta, new_value) values ($1, $2, 10, 10)`, [D, reviewD]);
    await q1(`insert into public.notes (user_id, user_book_id, type, content) values ($1, $2, 'iqtibos', 'Esda qolsin')`, [D, reviewD]);
    const [{ id: shelf }] = await q1<{ id: number }>(`insert into public.shelves (user_id, name) values ($1, 'Sevimlilar') returning id`, [D]);
    await q1(`insert into public.shelf_books (shelf_id, book_id) values ($1, $2)`, [shelf, book]);
    // Telegram, xato xabari
    await q1(`insert into public.telegram_accounts (user_id, telegram_id) values ($1, 900000004)`, [D]);
    await q1(`insert into public.telegram_link_tokens (user_id) values ($1)`, [D]);
    await q1(`insert into public.book_reports (user_id, book_id, message) values ($1, $2, 'Muqova xato')`, [D, book]);
    await q1(`insert into public.profile_topics (user_id, topic_id) select $1, id from public.topics limit 1`, [D]);
    // obunalar va ovozlar — ikki tomonga
    await q1(`insert into public.follows (follower_id, following_id) values ($1, $2), ($2, $1)`, [D, A]);
    [{ id: reviewA }] = await q1<{ id: number }>(
      `insert into public.user_books (user_id, book_id, status, review) values ($1, $2, 'read', 'Menga ham yoqdi') returning id`,
      [A, book],
    );
    await q1(`insert into public.review_votes (user_id, user_book_id) values ($1, $2), ($3, $4)`, [D, reviewA, A, reviewD]);
    // oʻzi ochgan klub (ichida boshqa aʼzoning xabari) va boshqaning klubidagi aʼzoligi
    const slug = (await as("authenticated", D, `select public.create_club('Ketuvchining klubi', null, true) as s`)).rows[0].s;
    [{ id: ownClub }] = await q1<{ id: number }>(`select id from public.clubs where slug = $1`, [slug]);
    await q1(`insert into public.club_members (club_id, user_id) values ($1, $2)`, [ownClub, A]);
    await q1(`insert into public.club_posts (club_id, user_id, body) values ($1, $2, 'Salom, klub!')`, [ownClub, A]);
    [{ id: otherClub }] = await q1<{ id: number }>(`select id from public.clubs where owner_id = $1 order by id limit 1`, [A]);
    await q1(`insert into public.club_members (club_id, user_id) values ($1, $2)`, [otherClub, D]);
    const [{ id: post }] = await q1<{ id: number }>(
      `insert into public.club_posts (club_id, user_id, body) values ($1, $2, 'Men ketyapman') returning id`,
      [otherClub, D],
    );
    await q1(`insert into public.club_posts (club_id, user_id, parent_id, body) values ($1, $2, $3, 'Xayr')`, [otherClub, A, post]);
    // shikoyatlar: uning ustidan yozilgani va oʻzi yozgani
    await q1(
      `insert into public.content_reports (reporter_id, target_type, target_id, target_user_id, reason, snapshot)
       values ($1, 'review', $2, $3, 'abuse', 'Zoʻr kitob'), ($3, 'review', $4, $1, 'spam', 'Menga ham yoqdi')`,
      [A, reviewD, D, reviewA],
    );

    // triggerlar yozgan bildirishnomalar: unga kelgani va u sababchi boʻlgani
    expect((await q1(`select 1 from public.notifications where user_id = $1`, [D])).length).toBeGreaterThan(0);
    expect((await q1(`select 1 from public.notifications where actor_id = $1`, [D])).length).toBeGreaterThan(0);

    await q1(`delete from auth.users where id = $1`, [D]);
  });

  it("foydalanuvchiga tegishli hech narsa qolmaydi", async () => {
    const left = async (table: string, column = "user_id") => (await q1(`select 1 from public.${table} where ${column} = $1`, [D])).length;
    expect(await left("profiles", "id")).toBe(0);
    for (const table of ["user_books", "reading_sessions", "notes", "shelves", "activities", "telegram_accounts", "telegram_link_tokens", "book_reports", "review_votes", "club_members", "club_posts", "profile_topics"]) {
      expect(await left(table), table).toBe(0);
    }
    // bildirishnomalar: unga kelgani ham, u sababchi boʻlgani ham (kuzatish, ovoz, klubdagi xabarlar)
    expect(await left("notifications")).toBe(0);
    expect(await left("notifications", "actor_id")).toBe(0);
    expect(await left("follows", "follower_id")).toBe(0);
    expect(await left("follows", "following_id")).toBe(0);
    expect(await left("clubs", "owner_id")).toBe(0);
    // oʻzi ochgan klub butun muhokamasi bilan ketadi; uning taqriziga berilgan ovoz va xabariga yozilgan javob ham
    expect(await q1(`select 1 from public.club_posts where club_id = $1`, [ownClub])).toEqual([]);
    expect(await q1(`select 1 from public.club_members where club_id = $1`, [ownClub])).toEqual([]);
    expect(await q1(`select 1 from public.review_votes where user_book_id = $1`, [reviewD])).toEqual([]);
    expect(await q1(`select 1 from public.club_posts where club_id = $1 and body = 'Xayr'`, [otherClub])).toEqual([]);
    // uning ustidan yozilgan shikoyat (matn nusxasi bilan) oʻchadi; oʻzi yozgani qoladi, lekin kim yozgani unutiladi
    expect(await left("content_reports", "target_user_id")).toBe(0);
    expect(await left("content_reports", "reporter_id")).toBe(0);
    expect(await q1(`select reporter_id, status from public.content_reports where target_id = $1 and reason = 'spam' and snapshot = 'Menga ham yoqdi'`, [reviewA])).toEqual([
      { reporter_id: null, status: "open" },
    ]);
  });

  it("qoʻshgan kitobi katalogda qoladi, boshqalarning maʼlumotiga tegilmaydi", async () => {
    expect(await q1(`select created_by, source from public.books where id = $1`, [book])).toEqual([{ created_by: null, source: "user" }]);
    expect(await q1(`select review from public.user_books where id = $1`, [reviewA])).toEqual([{ review: "Menga ham yoqdi" }]);
    expect(await q1(`select 1 from public.profiles where id = $1`, [A])).toHaveLength(1);
    expect(await q1(`select 1 from public.clubs where id = $1`, [otherClub])).toHaveLength(1);
  });
});

// Migratsiya bu yerda qayta ishga tushiriladi (iflos maʼlumot ustida) — shuning uchun fayl oxirida turadi.
describe("20261116000019: katalogni tozalash", () => {
  const migration = fs.readFileSync(path.join(MIGRATIONS, "20261116000019_catalog_cleanup.sql"), "utf8");
  const q1 = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  const book = async (slug: string) =>
    (await q1(`select slug, title, author_names, published_year::int as year, source_url from public.books where slug = $1`, [slug]))[0];
  const state = () =>
    q1(`select (select jsonb_agg(to_jsonb(b) - 'search_text' order by b.id) from public.books b) as books,
               (select jsonb_agg(to_jsonb(r) order by r.old_slug) from public.book_redirects r) as redirects,
               (select jsonb_agg(to_jsonb(t) order by t.id) from public.topics t) as topics`);

  beforeAll(async () => {
    await db.exec(`
      insert into public.topics (name, slug) values ('AT', 'at'), ('Bolalarbop', 'bolalarbop'), ('Diniy-Maʼrifiy', 'diniy-marifiy');
      insert into public.publishers (name, slug) values ('Zamon kitob', 'zamon-kitob');
      insert into public.authors (name, slug) values ('G''ayrat Majid', 'gayrat-majid');
      insert into public.books (slug, title, author_names, source, source_url, published_year) values
        ('o-tgan-kunlar', 'O''tgan kunlar', 'Abdulla Qodiriy', 'mutolaa', 'https://mutolaa.com/uz/book/o-tgan-kunlar', 20241),
        ('she-rlar-31', 'She’rlar', 'Cho\`lpon', 'mutolaa', 'https://mutolaa.com/uz/book/she-rlar-31', 126),
        ('sherlar-31', 'Boshqa kitob', null, 'asaxiy', null, 2020),
        ('besh-bolali-yigitcha', 'Besh bolali yigitcha (Zamon kitob)', 'Xudoyberdi To''xtaboyev', 'asaxiy', null, null),
        ('kings-speech', 'The King''s Speech (Used)', 'Mark Logue', 'asaxiy', null, null);
    `);
    await db.exec(migration);
  });

  it("rukn nomlari yangilanadi, manzillari oʻzgarmaydi", async () => {
    expect(await q1(`select slug, name from public.topics where slug in ('at', 'bolalarbop', 'diniy-marifiy') order by slug`)).toEqual([
      { slug: "at", name: "IT va dasturlash" },
      { slug: "bolalarbop", name: "Bolalar adabiyoti" },
      { slug: "diniy-marifiy", name: "Diniy-maʼrifiy" },
    ]);
  });

  it("Mutolaa kitobining manzili tozalanadi, eski manzil yoʻnaltiriladi", async () => {
    expect(await book("otgan-kunlar")).toEqual({
      slug: "otgan-kunlar",
      title: "Oʻtgan kunlar",
      author_names: "Abdulla Qodiriy",
      year: 2024,
      source_url: "https://mutolaa.com/uz/book/o-tgan-kunlar",
    });
    expect(await book("o-tgan-kunlar")).toBeUndefined();
    // "sherlar-31" band — raqam qoʻshiladi
    expect(await book("sherlar-31-2")).toMatchObject({ title: "Sheʼrlar", author_names: "Choʻlpon", year: null });
    expect(await book("sherlar-31")).toMatchObject({ title: "Boshqa kitob", year: 2020 });
    expect(
      await q1(`select r.old_slug, b.slug from public.book_redirects r join public.books b on b.id = r.book_id where r.old_slug in ('o-tgan-kunlar', 'she-rlar-31') order by 1`),
    ).toEqual([
      { old_slug: "o-tgan-kunlar", slug: "otgan-kunlar" },
      { old_slug: "she-rlar-31", slug: "sherlar-31-2" },
    ]);
  });

  it("nomdagi doʻkon izi olib tashlanadi; oʻzbekcha boʻlmagan kitobda apostrofga tegilmaydi", async () => {
    expect(await book("besh-bolali-yigitcha")).toMatchObject({ title: "Besh bolali yigitcha", author_names: "Xudoyberdi To'xtaboyev" });
    expect(await book("kings-speech")).toMatchObject({ title: "The King's Speech" });
    expect(await q1(`select name from public.authors where slug = 'gayrat-majid'`)).toEqual([{ name: "Gʻayrat Majid" }]);
  });

  it("qayta ishga tushirilsa hech narsa oʻzgarmaydi", async () => {
    const before = await state();
    await db.exec(migration);
    expect(await state()).toEqual(before);
  });

  it("SQL funksiyalari lib/text/clean.ts bilan bir xil natija beradi", async () => {
    const texts = ["O'tkan kunlar", "G‘afur G`ulom", "tog' va bog'", "She'rlar", "'Bog' kitobi", "O'Genri", "King's Landing", "Ma’naviyat", "Ўткан кунлар"];
    for (const t of texts) {
      expect((await q1<{ v: string }>(`select pg_temp.fix_apostrophes($1) as v`, [t]))[0].v, t).toBe(normalizeApostrophes(t));
    }

    const publishers = await q1<{ name: string; slug: string }>(`select name, slug from public.publishers`);
    const noise = titleNoise(publishers.flatMap((p) => [p.name, p.slug]));
    const titles = ["Besh bolali yigitcha (Global books)", "Sarmoyador [Asaxiy]", "Kitob (Yumshoq muqova) 2-nashr", "Война и мир (мягкая) (Used)", "Hikmatlar (A5)", "Roman (zamon-kitob), 1-jild", "(Used)"];
    for (const t of titles) {
      expect((await q1<{ v: string }>(`select pg_temp.clean_title($1, pg_temp.title_noise()) as v`, [t]))[0].v, t).toBe(cleanTitle(t, noise));
    }

    const slugs: [string, string][] = [
      ["o-tkan-kunlar", "Oʻtkan kunlar"],
      ["she-rlar-31", "Sheʼrlar"],
      ["uyg-onish-abu-ali-ibn-sino", "Uygʻonish. Abu Ali ibn Sino"],
      ["boshqa-nom", "Oʻtkan kunlar"],
      ["o-tkan-kunlarim", "Oʻtkan kunlar"],
    ];
    for (const [slug, title] of slugs) {
      expect((await q1<{ v: string }>(`select pg_temp.clean_mutolaa_slug($1, $2) as v`, [slug, title]))[0].v, slug).toBe(cleanMutolaaSlug(slug, title));
    }

    for (const year of [2024, 20241, 126, 1898, 20991, 2099]) {
      expect((await q1<{ v: number | null }>(`select pg_temp.sane_year($1)::int as v`, [year]))[0].v, String(year)).toBe(saneYear(year));
    }
  });
});
