-- Xatchoʻp: shikoyatlar navbati va admin paneli. Qayta ishga tushirsa ham xavfsiz.
--   1. content_reports — taqriz, klubdagi xabar yoki profil ustidan shikoyat
--   2. book_reports.resolved_at — katalogdagi xato haqidagi xabarni "hal qilindi" deb belgilash
--   3. admin_stats() — admin paneli uchun umumiy sonlar
-- Uchalasi ham faqat service role orqali ishlatiladi (app/actions/reports.ts, admin-reports.ts, lib/admin-panel.ts):
-- foydalanuvchi rollariga hech qanday huquq berilmaydi.

-- ============================================================
-- 1. Shikoyatlar
--    Nishonga (taqriz/xabar) tashqi kalit ataylab qoʻyilmagan: matn oʻchirilgach ham shikoyat tarixi qoladi.
--    Shikoyat qilingan odam hisobini oʻchirsa — u haqidagi shikoyatlar (va matn nusxasi) ham oʻchadi.
-- ============================================================
create table if not exists public.content_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid references auth.users (id) on delete set null,
  target_type text not null check (target_type in ('review', 'club_post', 'profile')),
  -- review: user_books.id, club_post: club_posts.id, profile: boʻsh
  target_id bigint,
  -- shikoyat qilingan matn muallifi (profile turida — oʻsha profil egasi)
  target_user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'inappropriate', 'other')),
  message text check (char_length(message) <= 500),
  -- shikoyat paytidagi matn: keyin tahrirlansa ham nima ustidan shikoyat qilingani koʻrinadi
  snapshot text check (char_length(snapshot) <= 4000),
  status text not null default 'open' check (status in ('open', 'removed', 'dismissed')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check ((target_type = 'profile') = (target_id is null))
);

create index if not exists content_reports_open_idx on public.content_reports (created_at) where status = 'open';
create index if not exists content_reports_reporter_idx on public.content_reports (reporter_id, created_at desc);
create index if not exists content_reports_target_user_idx on public.content_reports (target_user_id);
-- Bir odam bitta narsa ustidan koʻrib chiqilguncha faqat bir marta shikoyat qiladi
create unique index if not exists content_reports_once_idx
  on public.content_reports (reporter_id, target_type, coalesce(target_id, 0), target_user_id)
  where status = 'open';

alter table public.content_reports enable row level security;
revoke all on public.content_reports from anon, authenticated;

-- ============================================================
-- 2. Katalog xatosi haqidagi xabarlar: hal qilingani belgilanadi
-- ============================================================
alter table public.book_reports add column if not exists resolved_at timestamptz;
create index if not exists book_reports_open_idx on public.book_reports (created_at) where resolved_at is null;

-- ============================================================
-- 3. Admin paneli sonlari (bitta soʻrovda). "Faol" — shu davrda javonini oʻzgartirgan, progress kiritgan,
--    qayd yoki klubda xabar yozgan odam. Kunlar Toshkent vaqti boʻyicha.
-- ============================================================
create or replace function public.admin_stats()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with active as (
    select user_id, created_at as at from public.reading_sessions where created_at > now() - interval '30 days'
    union all
    select user_id, updated_at from public.user_books where updated_at > now() - interval '30 days'
    union all
    select user_id, updated_at from public.notes where updated_at > now() - interval '30 days'
    union all
    select user_id, created_at from public.club_posts where created_at > now() - interval '30 days'
  ),
  days as (
    select generate_series(
      (now() at time zone 'Asia/Tashkent')::date - 13, (now() at time zone 'Asia/Tashkent')::date, interval '1 day'
    )::date as day
  )
  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'users_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'active_7d', (select count(distinct user_id) from active where at > now() - interval '7 days'),
    'active_30d', (select count(distinct user_id) from active),
    'public_profiles', (select count(*) from public.profiles where is_public),
    'telegram_linked', (select count(*) from public.telegram_accounts),
    'books_total', (select count(*) from public.books),
    'books_user_total', (select count(*) from public.books where source = 'user'),
    'books_user_7d', (select count(*) from public.books where source = 'user' and created_at > now() - interval '7 days'),
    'shelf_total', (select count(*) from public.user_books),
    'shelf_7d', (select count(*) from public.user_books where created_at > now() - interval '7 days'),
    'reviews_total', (select count(*) from public.user_books where review is not null),
    'notes_total', (select count(*) from public.notes),
    'sessions_7d', (select count(*) from public.reading_sessions where created_at > now() - interval '7 days'),
    'clubs_total', (select count(*) from public.clubs),
    'club_posts_7d', (select count(*) from public.club_posts where created_at > now() - interval '7 days'),
    'reports_open', (select count(*) from public.content_reports where status = 'open'),
    'book_reports_open', (select count(*) from public.book_reports where resolved_at is null),
    'signups_by_day', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'count', (
        select count(*) from public.profiles p where (p.created_at at time zone 'Asia/Tashkent')::date = d.day
      )) order by d.day)
      from days d
    )
  )
$$;

revoke execute on function public.admin_stats() from public, anon, authenticated;
grant execute on function public.admin_stats() to service_role;
