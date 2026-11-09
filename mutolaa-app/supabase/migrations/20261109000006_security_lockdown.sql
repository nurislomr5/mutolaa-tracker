-- Sahifa: xavfsizlik — Data API (PostgREST) orqali toʻgʻridan-toʻgʻri kirishni ilova ehtiyojiga qadar toraytirish.
-- Ilova katalogga faqat service role orqali (server action'lar va import skriptlari) yozadi, shuning uchun
-- foydalanuvchi rollariga bu huquqlar kerak emas.

-- ============================================================
-- 1. books: foydalanuvchi API orqali kitob qoʻsha/tahrirlay olmasin
--    Avval: authenticated INSERT/UPDATE qila olardi → kunlik limitni chetlab oʻtish va
--    mutolaa_rating / mutolaa_reading_count / is_premium kabi ustunlarni soxtalashtirish mumkin edi.
--    Endi: faqat app/actions/add-book.ts va edit-book.ts (tekshiruv + validatsiyadan keyin service role bilan).
-- ============================================================
drop policy if exists "o'z kitobini qo'shish" on public.books;
drop policy if exists "o'z kitobini tahrirlash" on public.books;
revoke insert, update, delete on public.books from authenticated, anon;

-- Katalogning boshqa jadvallariga ham faqat oʻqish
revoke insert, update, delete on public.authors, public.genres, public.topics, public.publishers,
  public.book_authors, public.book_genres, public.book_topics, public.book_sources
  from authenticated, anon;

-- ============================================================
-- 2. profiles: ochiq profilning faqat ommaviy ustunlari koʻrinsin
--    Avval: anon/authenticated ochiq profilning barcha ustunlarini oʻqiy olardi
--    (reminder_hour, last_reminded_on, last_streak_alert_on, last_digest_on — oʻqish odatlari va faollik).
--    Ustun darajasidagi grant: qator darajasidagi RLS oʻzgarmaydi.
-- ============================================================
revoke select, insert, update, delete on public.profiles from anon, authenticated;

grant select (id, username, display_name, avatar_url, yearly_goal, is_public, created_at)
  on public.profiles to anon, authenticated;

-- Foydalanuvchi faqat formadagi maydonlarni oʻzgartira oladi (avatar_url — OAuth'dan, last_* — cron'dan)
grant update (username, display_name, yearly_goal, is_public, reminder_hour, streak_alerts, weekly_digest)
  on public.profiles to authenticated;

-- Oʻz eslatma sozlamalarini oʻqish (sozlamalar sahifasi uchun) — faqat oʻziniki
create or replace function public.my_reminder_settings()
returns table (reminder_hour smallint, streak_alerts boolean, weekly_digest boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.reminder_hour, p.streak_alerts, p.weekly_digest
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke execute on function public.my_reminder_settings() from public, anon;
grant execute on function public.my_reminder_settings() to authenticated;

-- ============================================================
-- 3. telegram_link_tokens: token va muddatni foydalanuvchi oʻzi tanlay olmasin
--    Avval: insert'da token (oldindan maʼlum qiymat) va expires_at (cheksiz muddat) berish mumkin edi.
-- ============================================================
revoke insert, update on public.telegram_link_tokens from authenticated;
grant insert (user_id) on public.telegram_link_tokens to authenticated;

-- ============================================================
-- 4. Qoʻshimcha indekslar: yangi nashrlarni saralash uchun
-- ============================================================
create index if not exists books_new_sort_idx on public.books (published_year desc nulls last, first_seen_at desc);

