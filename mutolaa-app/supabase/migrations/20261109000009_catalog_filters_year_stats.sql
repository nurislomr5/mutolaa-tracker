-- Sahifa: katalog filtrlari (til, sotuvda bor, nashriyot nashrlari orqali) va yillik statistika bazada.
-- Qayta ishga tushirsa ham xavfsiz.

-- ============================================================
-- 1. Nashr tili: Asaxiy'dagi erkin matn ("o'zb/rus", "узб/рус/англ", "en") → {uz, ru, en, other}
--    Mutolaa kitoblari — oʻzbekcha.
-- ============================================================
create or replace function public.source_langs(source text, language text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when source = 'mutolaa' then array['uz']
    when nullif(btrim(language), '') is null then array[]::text[]
    else (
      select coalesce(array_agg(distinct code order by code), array[]::text[])
      from (
        select case
          when t ~ '^(uz|uzb|o.?zb|oʻzb|o‘zb|ozb|узб|ўзб)' then 'uz'
          when t ~ '^(ru|rus|рус)' then 'ru'
          when t ~ '^(en|eng|ingliz|english|англ)' then 'en'
          else 'other'
        end as code
        from regexp_split_to_table(lower(btrim(language)), '\s*[/,;]\s*') as t
        where t <> ''
      ) codes
    )
  end
$$;

alter table public.book_sources
  add column if not exists langs text[] generated always as (public.source_langs(source, language)) stored;
create index if not exists book_sources_langs_idx on public.book_sources using gin (langs);
create index if not exists book_sources_publisher_idx on public.book_sources (publisher_id) where publisher_id is not null;
create index if not exists book_sources_in_stock_idx on public.book_sources (book_id) where in_stock;

-- ============================================================
-- 2. Katalog qidiruvi + filtrlar. Nashriyot: kitobning oʻzi yoki uning biror nashri (book_sources) orqali.
--    Til va "sotuvda bor" — bitta nashrga tegishli boʻlishi kerak (masalan, ruscha nashr sotuvda).
-- ============================================================
-- pg_trgm kutubxonasini shu seansda yuklash: aks holda Supabase SQL Editor (superuser emas) funksiyadagi
-- "set pg_trgm.word_similarity_threshold" ni rad etadi — "permission denied to set parameter"
select extensions.word_similarity('a', 'a');

create or replace function public.search_catalog(
  q text,
  p_publisher text default null,
  p_lang text default null,
  p_in_stock boolean default false
)
returns setof public.books
language sql
stable
set search_path = public, extensions
set pg_trgm.word_similarity_threshold = 0.5
as $$
  with n as (select public.uz_normalize(q) as q),
  pub as (select p.id from public.publishers p where p.slug = p_publisher)
  select b.*
  from public.books b, n
  where (n.q = ''
         or b.search_text like '%' || n.q || '%'
         or n.q <% b.search_text)
    and (p_publisher is null
         or b.publisher_id in (select id from pub)
         or exists (select 1 from public.book_sources s where s.book_id = b.id and s.publisher_id in (select id from pub)))
    and ((p_lang is null and not coalesce(p_in_stock, false))
         or exists (
           select 1 from public.book_sources s
           where s.book_id = b.id
             and (p_lang is null or p_lang = any (s.langs))
             and (not coalesce(p_in_stock, false) or s.in_stock)
         ))
  order by
    (n.q <> '' and b.search_text like n.q || '%') desc,
    case when n.q = '' then 0 else word_similarity(n.q, b.search_text) end desc,
    b.mutolaa_reading_count desc nulls last,
    b.id
$$;

-- Eski nom (bot, kitob qoʻshishdagi takror tekshiruvi) — filtrsiz qidiruv bilan bir xil
create or replace function public.search_books(q text)
returns setof public.books
language sql
stable
set search_path = public, extensions
as $$
  select * from public.search_catalog(q)
$$;

grant execute on function public.search_catalog(text, text, text, boolean) to anon, authenticated;
grant execute on function public.search_books(text) to anon, authenticated;

-- Nashriyotlar roʻyxati: kitoblar soni nashrlar orqali bogʻlanganlari bilan birga (takrorsiz)
create or replace function public.publisher_book_counts()
returns table (name text, slug text, count bigint)
language sql
stable
set search_path = ''
as $$
  select p.name, p.slug, count(distinct x.book_id)
  from public.publishers p
  join (
    select b.id as book_id, b.publisher_id from public.books b where b.publisher_id is not null
    union
    select s.book_id, s.publisher_id from public.book_sources s where s.publisher_id is not null
  ) x on x.publisher_id = p.id
  group by p.id, p.name, p.slug
$$;
grant execute on function public.publisher_book_counts() to anon, authenticated;

-- ============================================================
-- 3. Yillik statistika: oʻqish sessiyalarini bazada kunlarga yigʻish (Toshkent vaqti, UTC+5)
--    Avval: yil davomidagi barcha sessiyalar 1000 tadan sahifalab ilovaga yuklanardi.
--    Natija: { activity: {"YYYY-MM-DD": n}, pages, minutes } — activity joriy yilda streak uchun
--    oxirgi 400 kunni ham oʻz ichiga oladi. Faqat chaqirgan foydalanuvchining oʻz maʼlumoti (RLS + auth.uid()).
-- ============================================================
create or replace function public.get_user_year_stats(p_year integer)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select
      make_date(p_year, 1, 1) as y_from,
      make_date(p_year + 1, 1, 1) as y_to,
      (now() at time zone 'Asia/Tashkent')::date as today
  ),
  span as (
    select y_from, y_to,
      case when extract(year from today)::int = p_year then least(y_from, today - 400) else y_from end as s_from
    from bounds
  ),
  sess as (
    select (rs.created_at at time zone 'Asia/Tashkent')::date as day, rs.delta, ub.unit
    from public.reading_sessions rs
    join public.user_books ub on ub.id = rs.user_book_id
    , span
    where rs.user_id = (select auth.uid())
      and rs.delta > 0
      and rs.created_at >= (span.s_from::timestamp at time zone 'Asia/Tashkent')
      and rs.created_at < (span.y_to::timestamp at time zone 'Asia/Tashkent')
  ),
  days as (select day, count(*) as n from sess group by day)
  select jsonb_build_object(
    'activity', coalesce((select jsonb_object_agg(to_char(day, 'YYYY-MM-DD'), n) from days), '{}'::jsonb),
    'pages', coalesce((select sum(delta) from sess, span where unit = 'pages' and day >= span.y_from and day < span.y_to), 0),
    'minutes', coalesce((select sum(delta) from sess, span where unit = 'minutes' and day >= span.y_from and day < span.y_to), 0)
  )
$$;

revoke execute on function public.get_user_year_stats(integer) from public, anon;
grant execute on function public.get_user_year_stats(integer) to authenticated;
