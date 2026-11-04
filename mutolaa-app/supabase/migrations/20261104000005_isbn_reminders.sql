-- Sahifa: ISBN skaner va Telegram eslatmalar uchun.

-- ============================================================
-- 1. ISBN — faqat raqamlar (va X). Manbalar "978-9943-23-194-8" deb saqlaydi, skaner "9789943231948" beradi.
-- ============================================================
alter table public.books
  add column isbn_digits text generated always as (nullif(regexp_replace(upper(coalesce(isbn, '')), '[^0-9X]', '', 'g'), '')) stored;
alter table public.book_sources
  add column isbn_digits text generated always as (nullif(regexp_replace(upper(coalesce(isbn, '')), '[^0-9X]', '', 'g'), '')) stored;
create index books_isbn_digits_idx on public.books (isbn_digits) where isbn_digits is not null;
create index book_sources_isbn_digits_idx on public.book_sources (isbn_digits) where isbn_digits is not null;

-- ============================================================
-- 2. Eslatma sozlamalari (Toshkent vaqti)
-- ============================================================
alter table public.profiles
  add column reminder_hour smallint check (reminder_hour between 0 and 23), -- null = kunlik eslatma oʻchiq
  add column streak_alerts boolean not null default true,
  add column weekly_digest boolean not null default true,
  add column last_reminded_on date,       -- kunlik eslatma kuniga bir marta
  add column last_streak_alert_on date,
  add column last_digest_on date;

-- ============================================================
-- 3. Muallif va nashriyotni kuzatish ("yangi kitob chiqdi" xabarlari uchun)
-- ============================================================
create table public.author_follows (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  author_id bigint not null references public.authors (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, author_id)
);
create index author_follows_author_idx on public.author_follows (author_id);

create table public.publisher_follows (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  publisher_id bigint not null references public.publishers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, publisher_id)
);
create index publisher_follows_publisher_idx on public.publisher_follows (publisher_id);

alter table public.author_follows enable row level security;
alter table public.publisher_follows enable row level security;
create policy "o'z kuzatishlari" on public.author_follows for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "o'z kuzatishlari" on public.publisher_follows for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, delete on public.author_follows, public.publisher_follows to authenticated;

-- ============================================================
-- 4. Yuborilgan "yangi kitob" xabarlari — bir kitob haqida bir marta
-- ============================================================
create table public.book_notifications (
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id bigint not null references public.books (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
alter table public.book_notifications enable row level security;
create policy "o'z xabarlari" on public.book_notifications for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.book_notifications to authenticated;
