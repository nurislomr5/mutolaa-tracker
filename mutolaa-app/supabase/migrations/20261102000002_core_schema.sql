-- Sahifa: asosiy sxema — Mutolaa katalogi + foydalanuvchi ma'lumotlari (RLS bilan)

create extension if not exists pg_trgm with schema extensions;

-- ============================================================
-- O'zbekcha matnni qidiruv uchun normallashtirish
-- "Oʻtkan kunlar", "O'tkan kunlar", "Ўткан кунлар" -> "otkan kunlar"
-- (apostroflar olib tashlanadi, kirill lotinga o'giriladi, kichik harf)
-- ============================================================
create or replace function public.uz_normalize(input text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(regexp_replace(
    translate(
      replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
        -- so'z boshidagi kirill "е" -> "ye" (Ер -> yer)
        regexp_replace(lower(coalesce(input, '')), '(^|[^а-яА-ЯёЁўЎқҚғҒҳҲ])[еЕ]', '\1ye', 'g'),
        'ё', 'yo'), 'Ё', 'yo'), 'ц', 'ts'), 'Ц', 'ts'), 'ч', 'ch'), 'Ч', 'ch'), 'ш', 'sh'), 'Ш', 'sh'),
        'щ', 'sh'), 'Щ', 'sh'), 'ю', 'yu'), 'Ю', 'yu'), 'я', 'ya'), 'Я', 'ya'),
      'абвгдежзийклмнопрстуфхыэўқғҳ' || 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЫЭЎҚҒҲ' || 'ъьЪЬʻʼ‘’`´''',
      'abvgdejziyklmnoprstufxieoqgh' || 'abvgdejziyklmnoprstufxieoqgh'
    ),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- KATALOG (hamma o'qiy oladi; Mutolaa importi service role orqali yozadi)
-- ============================================================
create table public.authors (
  id bigint generated always as identity primary key,
  mutolaa_id integer unique,
  name text not null,
  slug text not null unique,
  image_url text,
  created_at timestamptz not null default now()
);

-- Mutolaa "categories" — janrlar (Jahon adabiyoti, Doston, ...)
create table public.genres (
  id bigint generated always as identity primary key,
  mutolaa_id integer unique,
  name text not null,
  slug text not null unique
);

-- Mutolaa "topics" — ruknlar (Badiiy adabiyot, Biznes, Psixologiya, ...)
create table public.topics (
  id bigint generated always as identity primary key,
  mutolaa_id integer unique,
  name text not null,
  slug text not null unique,
  icon_url text,
  color text
);

create table public.books (
  id bigint generated always as identity primary key,
  slug text not null unique,
  mutolaa_id integer unique,
  title text not null,
  author_names text,                       -- ro'yxat va qidiruv uchun: "Homer, ..."
  description text,
  cover_url text,
  formats text[] not null default '{}' check (formats <@ array['ebook', 'audio']),
  audio_seconds integer,
  audio_chapters jsonb,                    -- [{ "title": "1-qo'shiq", "seconds": 2315 }]
  page_count integer,
  narrator text,
  age_limit integer,
  language text,
  publisher text,
  is_premium boolean not null default false,
  mutolaa_rating numeric(3, 2),
  mutolaa_rating_count integer,
  mutolaa_reading_count integer,
  source text not null default 'mutolaa' check (source in ('mutolaa', 'user')),
  source_url text,
  source_raw jsonb,
  created_by uuid references auth.users (id) on delete set null,
  search_text text generated always as (
    public.uz_normalize(coalesce(title, '') || ' ' || coalesce(author_names, ''))
  ) stored,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index books_search_text_trgm on public.books using gin (search_text extensions.gin_trgm_ops);
create index books_popularity_idx on public.books (mutolaa_reading_count desc nulls last);
create trigger books_set_updated_at before update on public.books
  for each row execute function public.set_updated_at();

create table public.book_authors (
  book_id bigint not null references public.books (id) on delete cascade,
  author_id bigint not null references public.authors (id) on delete cascade,
  position smallint not null default 0,
  primary key (book_id, author_id)
);
create index book_authors_author_idx on public.book_authors (author_id);

create table public.book_genres (
  book_id bigint not null references public.books (id) on delete cascade,
  genre_id bigint not null references public.genres (id) on delete cascade,
  primary key (book_id, genre_id)
);
create index book_genres_genre_idx on public.book_genres (genre_id);

create table public.book_topics (
  book_id bigint not null references public.books (id) on delete cascade,
  topic_id bigint not null references public.topics (id) on delete cascade,
  primary key (book_id, topic_id)
);
create index book_topics_topic_idx on public.book_topics (topic_id);

-- ============================================================
-- FOYDALANUVCHI MA'LUMOTLARI (har kim faqat o'zinikini ko'radi)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text,
  avatar_url text,
  telegram_id bigint unique,
  yearly_goal integer check (yearly_goal > 0),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Yangi foydalanuvchi ro'yxatdan o'tganda profil avtomatik yaratiladi
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.user_books (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id bigint not null references public.books (id) on delete cascade,
  status text not null default 'want' check (status in ('want', 'reading', 'read', 'dnf')),
  format text check (format in ('paper', 'ebook', 'audio')),
  unit text not null default 'pages' check (unit in ('pages', 'minutes', 'percent')),
  current_value integer not null default 0 check (current_value >= 0),
  total_value integer check (total_value > 0),
  started_at date,
  finished_at date,
  rating numeric(2, 1) check (rating between 0.5 and 5 and rating * 2 = floor(rating * 2)),
  review text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_id)
);
create index user_books_user_status_idx on public.user_books (user_id, status);
create index user_books_book_idx on public.user_books (book_id);
create trigger user_books_set_updated_at before update on public.user_books
  for each row execute function public.set_updated_at();

create table public.reading_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_book_id bigint not null references public.user_books (id) on delete cascade,
  delta integer not null,
  new_value integer not null,
  source text not null default 'web' check (source in ('web', 'bot')),
  created_at timestamptz not null default now()
);
create index reading_sessions_user_time_idx on public.reading_sessions (user_id, created_at desc);
create index reading_sessions_user_book_idx on public.reading_sessions (user_book_id);

create table public.notes (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_book_id bigint not null references public.user_books (id) on delete cascade,
  type text not null check (type in ('iqtibos', 'savol', 'lugat', 'xulosa', 'taymkod')),
  reference_point text,
  content text not null,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_type_idx on public.notes (user_id, type);
create index notes_user_book_idx on public.notes (user_book_id);
create trigger notes_set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

create table public.shelves (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.shelf_books (
  shelf_id bigint not null references public.shelves (id) on delete cascade,
  book_id bigint not null references public.books (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (shelf_id, book_id)
);
create index shelf_books_book_idx on public.shelf_books (book_id);

-- Telegram botni akkauntga bog'lash uchun bir martalik token (bot service role bilan o'qiydi)
create table public.telegram_link_tokens (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now()
);
create index telegram_link_tokens_user_idx on public.telegram_link_tokens (user_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.authors enable row level security;
alter table public.genres enable row level security;
alter table public.topics enable row level security;
alter table public.books enable row level security;
alter table public.book_authors enable row level security;
alter table public.book_genres enable row level security;
alter table public.book_topics enable row level security;
alter table public.profiles enable row level security;
alter table public.user_books enable row level security;
alter table public.reading_sessions enable row level security;
alter table public.notes enable row level security;
alter table public.shelves enable row level security;
alter table public.shelf_books enable row level security;
alter table public.telegram_link_tokens enable row level security;

-- Katalog: hamma o'qiydi
create policy "katalog o'qish" on public.authors for select to anon, authenticated using (true);
create policy "katalog o'qish" on public.genres for select to anon, authenticated using (true);
create policy "katalog o'qish" on public.topics for select to anon, authenticated using (true);
create policy "katalog o'qish" on public.books for select to anon, authenticated using (true);
create policy "katalog o'qish" on public.book_authors for select to anon, authenticated using (true);
create policy "katalog o'qish" on public.book_genres for select to anon, authenticated using (true);
create policy "katalog o'qish" on public.book_topics for select to anon, authenticated using (true);

-- Foydalanuvchi Mutolaa'da yo'q kitobni qo'shishi va o'zi qo'shganini tahrirlashi mumkin
create policy "o'z kitobini qo'shish" on public.books for insert to authenticated
  with check (source = 'user' and created_by = (select auth.uid()));
create policy "o'z kitobini tahrirlash" on public.books for update to authenticated
  using (source = 'user' and created_by = (select auth.uid()))
  with check (source = 'user' and created_by = (select auth.uid()));

-- Profil
create policy "o'z profilini o'qish" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "o'z profilini tahrirlash" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Javon (user_books)
create policy "o'z kitoblari" on public.user_books for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Sessiya va qaydlar: user_book ham shu foydalanuvchiniki bo'lishi shart
create policy "o'z sessiyalari" on public.reading_sessions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.user_books ub where ub.id = user_book_id and ub.user_id = (select auth.uid()))
  );

create policy "o'z qaydlari" on public.notes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.user_books ub where ub.id = user_book_id and ub.user_id = (select auth.uid()))
  );

create policy "o'z javonlari" on public.shelves for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "o'z javonidagi kitoblar" on public.shelf_books for all to authenticated
  using (exists (select 1 from public.shelves s where s.id = shelf_id and s.user_id = (select auth.uid())))
  with check (exists (select 1 from public.shelves s where s.id = shelf_id and s.user_id = (select auth.uid())));

create policy "o'z tokenlari" on public.telegram_link_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Data API uchun aniq ruxsatlar (avtomatik grant'larga tayanmaymiz)
grant usage on schema public to anon, authenticated;
grant select on public.authors, public.genres, public.topics, public.books,
  public.book_authors, public.book_genres, public.book_topics to anon, authenticated;
grant insert, update on public.books to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_books, public.reading_sessions, public.notes,
  public.shelves, public.shelf_books, public.telegram_link_tokens to authenticated;

-- ============================================================
-- Qidiruv: lotin/kirill/apostrofdan qat'i nazar
-- supabase.rpc('search_books', { q }).select('id, slug, title, ...').range(0, 23)
-- ============================================================
create or replace function public.search_books(q text)
returns setof public.books
language sql
stable
set search_path = public, extensions
-- 0.5 — "odisey" -> "Odisseya" kabi kichik imlo xatolarini ham topadi (standart 0.6 topmaydi)
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

grant execute on function public.search_books(text) to anon, authenticated;
grant execute on function public.uz_normalize(text) to anon, authenticated;

-- Trigger funksiyasini API orqali chaqirib bo'lmasin
revoke execute on function public.handle_new_user() from public, anon, authenticated;
