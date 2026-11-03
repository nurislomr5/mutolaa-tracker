-- Sahifa: koʻp manbali katalog — Mutolaa (audio/e-kitob) + Asaxiy (qogʻoz kitob) va keyingi manbalar.
-- books — "asar" (bitta sahifa), book_sources — uning qayerda va qaysi nashrda borligi.

-- ============================================================
-- 1. Nashriyotlar
-- ============================================================
create table public.publishers (
  id bigint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);
alter table public.publishers enable row level security;
create policy "katalog o'qish" on public.publishers for select to anon, authenticated using (true);
grant select on public.publishers to anon, authenticated;

-- ============================================================
-- 2. books: qogʻoz nashr maʼlumotlari
-- ============================================================
alter table public.books
  add column isbn text,
  add column publisher_id bigint references public.publishers (id) on delete set null,
  add column published_year smallint,
  add column script text check (script in ('latin', 'cyrillic')),
  add column translator text,
  add column first_seen_at timestamptz not null default now();

-- mavjud kitoblar katalogga import qilingan vaqtdan "koʻrilgan"
update public.books set first_seen_at = coalesce(imported_at, created_at);

alter table public.books drop constraint books_formats_check;
alter table public.books add constraint books_formats_check check (formats <@ array['ebook', 'audio', 'paper']);
alter table public.books drop constraint books_source_check;
alter table public.books add constraint books_source_check check (source in ('mutolaa', 'asaxiy', 'user'));

create index books_isbn_idx on public.books (isbn) where isbn is not null;
create index books_publisher_idx on public.books (publisher_id);
create index books_first_seen_idx on public.books (first_seen_at desc);
-- importda "nom + muallif" boʻyicha aniq moslashtirish uchun
create index books_search_text_eq_idx on public.books (search_text);

-- ============================================================
-- 3. book_sources — har bir manbadagi nashr (narx, mavjudlik, betlar soni)
-- ============================================================
create table public.book_sources (
  id bigint generated always as identity primary key,
  book_id bigint not null references public.books (id) on delete cascade,
  source text not null check (source in ('mutolaa', 'asaxiy', 'hilol')),
  external_id text not null,
  url text not null,
  formats text[] not null default '{}' check (formats <@ array['ebook', 'audio', 'paper']),
  isbn text,
  publisher_id bigint references public.publishers (id) on delete set null,
  page_count integer,
  published_year smallint,
  cover_url text,
  cover_type text,
  script text check (script in ('latin', 'cyrillic')),
  language text,
  price integer,
  in_stock boolean,
  raw jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source, external_id)
);
create index book_sources_book_idx on public.book_sources (book_id);
create index book_sources_isbn_idx on public.book_sources (isbn) where isbn is not null;

alter table public.book_sources enable row level security;
create policy "katalog o'qish" on public.book_sources for select to anon, authenticated using (true);
grant select on public.book_sources to anon, authenticated;

-- Mavjud Mutolaa kitoblari — birinchi manba sifatida
insert into public.book_sources (book_id, source, external_id, url, formats, first_seen_at, last_seen_at)
select id, 'mutolaa', slug, coalesce(source_url, 'https://mutolaa.com/uz/book/' || slug), formats,
       coalesce(imported_at, created_at), coalesce(imported_at, created_at)
from public.books
where source = 'mutolaa';

-- ============================================================
-- 4. Qidiruv funksiyasini yangi ustunlar bilan qayta yaratish
-- ============================================================
create or replace function public.search_books(q text)
returns setof public.books
language sql
stable
set search_path = public, extensions
set pg_trgm.word_similarity_threshold = 0.5
as $$
  with n as (select public.uz_normalize(q) as q)
  select b.*
  from public.books b, n
  where n.q = ''
     or b.search_text like '%' || n.q || '%'
     or n.q <% b.search_text
  order by
    (n.q <> '' and b.search_text like n.q || '%') desc,
    case when n.q = '' then 0 else word_similarity(n.q, b.search_text) end desc,
    b.mutolaa_reading_count desc nulls last,
    b.id
$$;
