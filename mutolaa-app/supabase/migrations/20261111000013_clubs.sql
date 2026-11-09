-- Sahifa: kitobxonlik klublari. Qayta ishga tushirsa ham xavfsiz.
-- Klub: aʼzolar, joriy kitob (aʼzolarning shu kitobdagi progressi), muhokama (xabar + bir darajali javob).
-- Ochiq klub — katalogda koʻrinadi, istalgan odam qoʻshiladi; yopiq — faqat taklif kodi bilan, tashqaridan koʻrinmaydi.
-- Oʻqish: security definer funksiyalar (kirish huquqi ichida tekshiriladi, aʼzolar ismi profil yopiq boʻlsa ham klubda koʻrinadi —
-- qoʻshilishda shu haqda ogohlantiriladi). Yozish: RLS'li jadvallar va funksiyalar.
-- Eslatma: clubs.owner_id auth.users ga bogʻlangan (profiles emas) — PostgREST'da profiles↔books orasida yangi
-- bogʻlanish yoʻli paydo boʻlmasin (aks holda mavjud embed soʻrovlar ikki maʼnoli boʻlib qoladi).

create table if not exists public.clubs (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null check (char_length(name) between 3 and 80),
  description text check (char_length(description) <= 1000),
  is_public boolean not null default true,
  invite_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  owner_id uuid not null references auth.users (id) on delete cascade,
  current_book_id bigint references public.books (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clubs_owner_idx on public.clubs (owner_id);
create index if not exists clubs_public_idx on public.clubs (created_at desc) where is_public;
drop trigger if exists clubs_set_updated_at on public.clubs;
create trigger clubs_set_updated_at before update on public.clubs for each row execute function public.set_updated_at();

create table if not exists public.club_members (
  club_id bigint not null references public.clubs (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index if not exists club_members_user_idx on public.club_members (user_id);

create table if not exists public.club_posts (
  id bigint generated always as identity primary key,
  club_id bigint not null references public.clubs (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  parent_id bigint references public.club_posts (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists club_posts_club_idx on public.club_posts (club_id, created_at desc);
create index if not exists club_posts_user_idx on public.club_posts (user_id, created_at desc);

-- ============================================================
-- Yordamchi tekshiruvlar (RLS ichida club_members ni rekursiyasiz oʻqish uchun security definer)
-- ============================================================
create or replace function public.is_club_member(p_club_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.club_members where club_id = p_club_id and user_id = (select auth.uid()))
$$;

create or replace function public.is_club_owner(p_club_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clubs where id = p_club_id and owner_id = (select auth.uid()))
$$;

create or replace function public.can_view_club(p_club_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clubs where id = p_club_id and is_public) or public.is_club_member(p_club_id)
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_posts enable row level security;

drop policy if exists "klublarni koʻrish" on public.clubs;
create policy "klublarni koʻrish" on public.clubs for select to anon, authenticated
  using (is_public or public.is_club_member(id));
drop policy if exists "klubni tahrirlash" on public.clubs;
create policy "klubni tahrirlash" on public.clubs for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "klubni oʻchirish" on public.clubs;
create policy "klubni oʻchirish" on public.clubs for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "aʼzolarni koʻrish" on public.club_members;
create policy "aʼzolarni koʻrish" on public.club_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_club_member(club_id));
drop policy if exists "ochiq klubga qoʻshilish" on public.club_members;
create policy "ochiq klubga qoʻshilish" on public.club_members for insert to authenticated
  with check (
    user_id = (select auth.uid()) and role = 'member'
    and exists (select 1 from public.clubs c where c.id = club_id and c.is_public)
  );
drop policy if exists "klubdan chiqish" on public.club_members;
create policy "klubdan chiqish" on public.club_members for delete to authenticated
  using (role = 'member' and (user_id = (select auth.uid()) or public.is_club_owner(club_id)));

drop policy if exists "muhokamani koʻrish" on public.club_posts;
create policy "muhokamani koʻrish" on public.club_posts for select to anon, authenticated
  using (public.can_view_club(club_id));
drop policy if exists "xabar yozish" on public.club_posts;
create policy "xabar yozish" on public.club_posts for insert to authenticated
  with check (
    user_id = (select auth.uid()) and public.is_club_member(club_id)
    -- javob faqat shu klubdagi yuqori darajali xabarga (javobga javob yoʻq)
    and (club_posts.parent_id is null or exists (
      select 1 from public.club_posts p where p.id = club_posts.parent_id and p.club_id = club_posts.club_id and p.parent_id is null
    ))
  );
drop policy if exists "xabarni oʻchirish" on public.club_posts;
create policy "xabarni oʻchirish" on public.club_posts for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_club_owner(club_id));

-- Ustun darajasidagi ruxsatlar: taklif kodi va egasi faqat funksiyalar orqali; slug oʻzgarmaydi
revoke all on public.clubs, public.club_members, public.club_posts from anon, authenticated;
grant select (id, slug, name, description, is_public, current_book_id, created_at) on public.clubs to anon, authenticated;
grant update (name, description, is_public, current_book_id) on public.clubs to authenticated;
grant delete on public.clubs to authenticated;
grant select on public.club_members to authenticated;
grant insert (club_id) on public.club_members to authenticated;
grant delete on public.club_members to authenticated;
grant select (id, club_id, parent_id, body, created_at) on public.club_posts to anon, authenticated;
grant insert (club_id, parent_id, body) on public.club_posts to authenticated;
grant delete on public.club_posts to authenticated;

-- Spamga qarshi: bir kishi soatiga 30 tadan koʻp xabar yoza olmaydi
create or replace function public.club_posts_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.club_posts where user_id = new.user_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'club_posts: juda koʻp xabar' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists club_posts_rate_limit on public.club_posts;
create trigger club_posts_rate_limit before insert on public.club_posts for each row execute function public.club_posts_rate_limit();
revoke execute on function public.club_posts_rate_limit() from public, anon, authenticated;

-- ============================================================
-- Funksiyalar (sayt shular orqali ishlaydi)
-- ============================================================

-- Klub ochish: kuniga 3 tadan koʻp emas; slug nomdan (takrorlansa raqam qoʻshiladi); yaratuvchi — boshqaruvchi aʼzo
create or replace function public.create_club(p_name text, p_description text, p_is_public boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  base text;
  candidate text;
  n integer := 1;
  new_id bigint;
begin
  if uid is null then raise exception 'create_club: kirish kerak' using errcode = '42501'; end if;
  if (select count(*) from public.clubs where owner_id = uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'create_club: kunlik cheklov' using errcode = 'P0001';
  end if;
  base := nullif(btrim(regexp_replace(public.uz_normalize(p_name), '[^a-z0-9]+', '-', 'g'), '-'), '');
  base := left(coalesce(base, 'klub'), 60);
  candidate := base;
  while exists (select 1 from public.clubs where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  insert into public.clubs (slug, name, description, is_public, owner_id)
    values (candidate, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_is_public, true), uid)
    returning id into new_id;
  insert into public.club_members (club_id, user_id, role) values (new_id, uid, 'owner');
  return candidate;
end;
$$;

-- Taklif kodi bilan qoʻshilish (yopiq klub ham); klub slug'ini qaytaradi
create or replace function public.join_club_by_code(p_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  c record;
begin
  if uid is null then raise exception 'join_club_by_code: kirish kerak' using errcode = '42501'; end if;
  select id, slug into c from public.clubs where invite_code = p_code;
  if c.id is null then return null; end if;
  insert into public.club_members (club_id, user_id) values (c.id, uid) on conflict do nothing;
  return c.slug;
end;
$$;

-- Taklif sahifasi uchun: kod toʻgʻri boʻlsa klub nomi va aʼzolar soni (kodni bilgan odam koʻradi)
create or replace function public.club_by_invite(p_code text)
returns table (slug text, name text, description text, member_count integer, is_member boolean)
language sql stable security definer set search_path = '' as $$
  select c.slug, c.name, c.description,
         (select count(*)::integer from public.club_members m where m.club_id = c.id),
         public.is_club_member(c.id)
  from public.clubs c where c.invite_code = p_code
$$;

-- Klub sahifasi: koʻrish huquqi boʻlsa maʼlumot (taklif kodi faqat egasiga)
create or replace function public.club_page(p_slug text)
returns table (
  id bigint, slug text, name text, description text, is_public boolean, created_at timestamptz,
  member_count integer, is_member boolean, is_owner boolean, invite_code text,
  book_id bigint, book_slug text, book_title text, book_authors text, book_cover text
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.description, c.is_public, c.created_at,
         (select count(*)::integer from public.club_members m where m.club_id = c.id),
         public.is_club_member(c.id),
         coalesce(c.owner_id = (select auth.uid()), false),
         case when c.owner_id = (select auth.uid()) then c.invite_code end,
         b.id, b.slug, b.title, b.author_names, b.cover_url
  from public.clubs c
  left join public.books b on b.id = c.current_book_id
  where c.slug = p_slug and (c.is_public or public.is_club_member(c.id))
$$;

-- Ochiq klublar katalogi va "mening klublarim" (yopiqlari ham)
create or replace function public.club_directory(p_mine boolean default false, p_limit integer default 60)
returns table (
  id bigint, slug text, name text, description text, is_public boolean, member_count integer,
  book_title text, book_cover text, last_activity timestamptz
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.description, c.is_public,
         (select count(*)::integer from public.club_members m where m.club_id = c.id),
         b.title, b.cover_url,
         greatest(c.updated_at, (select max(p.created_at) from public.club_posts p where p.club_id = c.id))
  from public.clubs c
  left join public.books b on b.id = c.current_book_id
  where case when p_mine then exists (select 1 from public.club_members m where m.club_id = c.id and m.user_id = (select auth.uid()))
             else c.is_public end
  order by 9 desc nulls last
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;

-- Aʼzolar va ularning joriy kitobdagi progressi (klubni koʻra oladiganlarga)
create or replace function public.club_members_view(p_club_id bigint)
returns table (
  user_id uuid, display_name text, username text, avatar_url text, role text, joined_at timestamptz,
  status text, unit text, current_value integer, total_value integer, rating numeric
)
language sql stable security definer set search_path = '' as $$
  select m.user_id, coalesce(p.display_name, p.username, 'Kitobxon'),
         case when p.is_public then p.username end, p.avatar_url, m.role, m.joined_at,
         ub.status, ub.unit, ub.current_value, ub.total_value, ub.rating
  from public.club_members m
  join public.profiles p on p.id = m.user_id
  join public.clubs c on c.id = m.club_id
  left join public.user_books ub on ub.user_id = m.user_id and ub.book_id = c.current_book_id
  where m.club_id = p_club_id and public.can_view_club(p_club_id)
  order by (m.role = 'owner') desc, m.joined_at
$$;

-- Muhokama: xabarlar muallif nomi bilan (klubni koʻra oladiganlarga), yangisi yuqorida, javoblar bilan
create or replace function public.club_feed(p_club_id bigint, p_limit integer default 50)
returns table (
  id bigint, parent_id bigint, body text, created_at timestamptz,
  user_id uuid, display_name text, username text, avatar_url text, can_delete boolean
)
language sql stable security definer set search_path = '' as $$
  with top as (
    select p.id from public.club_posts p
    where p.club_id = p_club_id and p.parent_id is null and public.can_view_club(p_club_id)
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  select p.id, p.parent_id, p.body, p.created_at, p.user_id,
         coalesce(pr.display_name, pr.username, 'Kitobxon'),
         case when pr.is_public then pr.username end, pr.avatar_url,
         coalesce(p.user_id = (select auth.uid()), false) or public.is_club_owner(p_club_id)
  from public.club_posts p
  join public.profiles pr on pr.id = p.user_id
  where p.id in (select id from top) or p.parent_id in (select id from top)
  order by coalesce(p.parent_id, p.id) desc, p.parent_id nulls first, p.created_at
$$;

-- Taklif kodini yangilash (eski havola ishlamay qoladi) — faqat egasi
create or replace function public.reset_club_invite(p_club_id bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare code text;
begin
  update public.clubs set invite_code = replace(gen_random_uuid()::text, '-', '')
    where id = p_club_id and owner_id = (select auth.uid())
    returning invite_code into code;
  return code;
end;
$$;

revoke execute on function public.is_club_member(bigint), public.is_club_owner(bigint), public.can_view_club(bigint),
  public.create_club(text, text, boolean), public.join_club_by_code(text), public.club_by_invite(text),
  public.club_page(text), public.club_directory(boolean, integer), public.club_members_view(bigint),
  public.club_feed(bigint, integer), public.reset_club_invite(bigint) from public;
-- Supabase yangi funksiyalarni avtomatik anon'ga ham ochadi — faqat kirganlar uchun boʻlganlari yopiladi
revoke execute on function public.create_club(text, text, boolean), public.join_club_by_code(text),
  public.reset_club_invite(bigint) from anon;
grant execute on function public.is_club_member(bigint), public.is_club_owner(bigint), public.can_view_club(bigint),
  public.club_page(text), public.club_directory(boolean, integer), public.club_members_view(bigint),
  public.club_feed(bigint, integer), public.club_by_invite(text) to anon, authenticated;
grant execute on function public.create_club(text, text, boolean), public.join_club_by_code(text),
  public.reset_club_invite(bigint) to authenticated;

-- ============================================================
-- Takroriy kitoblar birlashtirilsa (merge_books) klubning joriy kitobi ham asosiy kitobga oʻtadi:
-- book_redirects ga yozuv ikkinchi nusxa oʻchirilishidan oldin qoʻshiladi
-- ============================================================
create or replace function public.clubs_follow_book_redirect()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.clubs set current_book_id = new.book_id
  where current_book_id = (select id from public.books where slug = new.old_slug);
  return new;
end;
$$;
drop trigger if exists clubs_follow_book_redirect on public.book_redirects;
create trigger clubs_follow_book_redirect after insert or update on public.book_redirects
  for each row execute function public.clubs_follow_book_redirect();
revoke execute on function public.clubs_follow_book_redirect() from public, anon, authenticated;
