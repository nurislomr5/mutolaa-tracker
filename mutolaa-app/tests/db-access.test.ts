import fs from "node:fs";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { beforeAll, describe, expect, it } from "vitest";

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

  it("006 va 007 qayta ishga tushirilsa ham xato bermaydi", async () => {
    for (const f of fs.readdirSync(MIGRATIONS).filter((f) => /_(security_lockdown|book_reports)\.sql$/.test(f))) {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
    }
    await expectDenied("anon", null, `select reminder_hour from public.profiles`);
  });
});
