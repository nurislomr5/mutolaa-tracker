-- Sahifa: ijtimoiy qism — ommaviy profillar, kuzatish, faoliyat lentasi.
-- Profil sukut boʻyicha yopiq (is_public = false); faqat egasi ochiq qilganda javoni va baholari koʻrinadi.
-- Qaydlar (notes) va oʻqish sessiyalari har doim shaxsiy qoladi.

-- ============================================================
-- 1. Telegram bogʻlanishini alohida jadvalga koʻchirish
--    (profil ochiq boʻlganda telegram_id hammaga koʻrinib qolmasligi uchun)
-- ============================================================
create table public.telegram_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  telegram_id bigint not null unique,
  linked_at timestamptz not null default now()
);

insert into public.telegram_accounts (user_id, telegram_id)
select id, telegram_id from public.profiles where telegram_id is not null;

alter table public.profiles drop column telegram_id;

alter table public.telegram_accounts enable row level security;
create policy "o'z telegram hisobi" on public.telegram_accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy "telegram'ni uzish" on public.telegram_accounts for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, delete on public.telegram_accounts to authenticated;

-- ============================================================
-- 2. Ommaviy profil va javon
-- ============================================================
-- Ochiq profil uchun foydalanuvchi nomi shart (/u/<username> manzili)
alter table public.profiles add constraint profiles_public_needs_username
  check (not is_public or username is not null);

drop policy "o'z profilini o'qish" on public.profiles;
create policy "profilni o'qish" on public.profiles for select to anon, authenticated
  using (is_public or id = (select auth.uid()));
grant select on public.profiles to anon;

-- PostgREST'da user_books -> profiles bogʻlanishi (embedding) uchun
alter table public.user_books add constraint user_books_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

create policy "ochiq profil javoni" on public.user_books for select to anon, authenticated
  using (exists (select 1 from public.profiles p where p.id = user_books.user_id and p.is_public));
grant select on public.user_books to anon;

-- ============================================================
-- 3. Kuzatish
-- ============================================================
create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;
-- Oʻz kuzatishlarim/kuzatuvchilarim + ikki tomoni ham ochiq profil boʻlgan bogʻlanishlar koʻrinadi
create policy "kuzatishlarni o'qish" on public.follows for select to anon, authenticated
  using (
    follower_id = (select auth.uid())
    or following_id = (select auth.uid())
    or (
      exists (select 1 from public.profiles p where p.id = follower_id and p.is_public)
      and exists (select 1 from public.profiles p where p.id = following_id and p.is_public)
    )
  );
-- Faqat ochiq profilni kuzatish mumkin
create policy "kuzatish" on public.follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = following_id and p.is_public)
  );
create policy "kuzatishni bekor qilish" on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));
grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;

-- ============================================================
-- 4. Faoliyat lentasi — user_books oʻzgarganda trigger yozadi
-- ============================================================
create table public.activities (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id bigint not null references public.books (id) on delete cascade,
  kind text not null check (kind in ('want', 'reading', 'read', 'dnf', 'rated', 'reviewed')),
  rating numeric(2, 1),
  created_at timestamptz not null default now()
);
create index activities_user_time_idx on public.activities (user_id, created_at desc);
create index activities_time_idx on public.activities (created_at desc);
create index activities_book_idx on public.activities (book_id);

alter table public.activities enable row level security;
create policy "faoliyatni o'qish" on public.activities for select to anon, authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = activities.user_id and p.is_public)
  );
grant select on public.activities to anon, authenticated;

create or replace function public.log_user_book_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    -- bir soat ichida holatni bir necha marta almashtirsa, lentada faqat oxirgisi qoladi
    delete from public.activities
      where user_id = new.user_id and book_id = new.book_id
        and kind in ('want', 'reading', 'read', 'dnf') and created_at > now() - interval '1 hour';
    insert into public.activities (user_id, book_id, kind, rating)
      values (new.user_id, new.book_id, new.status, case when new.status = 'read' then new.rating end);
  end if;

  if tg_op = 'UPDATE' and new.rating is not null and new.rating is distinct from old.rating then
    delete from public.activities
      where user_id = new.user_id and book_id = new.book_id and kind = 'rated' and created_at > now() - interval '1 hour';
    insert into public.activities (user_id, book_id, kind, rating) values (new.user_id, new.book_id, 'rated', new.rating);
  end if;

  if coalesce(new.review, '') <> '' and (tg_op = 'INSERT' or coalesce(old.review, '') = '') then
    insert into public.activities (user_id, book_id, kind, rating) values (new.user_id, new.book_id, 'reviewed', new.rating);
  end if;

  return new;
end;
$$;

create trigger user_books_activity after insert or update on public.user_books
  for each row execute function public.log_user_book_activity();
revoke execute on function public.log_user_book_activity() from public, anon, authenticated;

-- Mavjud javonlardan boshlangʻich lenta
insert into public.activities (user_id, book_id, kind, rating, created_at)
select user_id, book_id, status, case when status = 'read' then rating end, updated_at from public.user_books;
