-- Xatchoʻp: sayt ichidagi bildirishnomalar (qoʻngʻiroqcha) va haftalik xulosa. Qayta ishga tushirsa ham xavfsiz.
--
--   * notifications            — kimga, nima haqida. Jadval toʻliq yopiq: faqat quyidagi funksiyalar orqali oʻqiladi.
--                                Sabab: "Foydali" ovozini kim bergani sir (20261110000012) — actor_id tashqariga chiqmasligi kerak.
--   * triggerlar               — yangi kuzatuvchi, taqrizga "Foydali" ovozi, klubdagi yangi xabar va javob.
--   * notify_new_books()       — kuzatilgan muallif/nashriyotning yangi kitoblari (cron, kuniga bir marta).
--   * notify_weekly_summary()  — shu hafta oʻqiganlarga "haftalik xulosa tayyor" (cron, yakshanba kechqurun).
--   * my_notifications() / unread_notifications_count() / mark_notifications_read() — sayt uchun.
--
-- Eslatma: club_id va post_id ataylab FK emas — notifications klublar bilan xabarlar orasida PostgREST uchun
-- yangi bogʻlanish yoʻli boʻlib qolmasin (README: PGRST201). Tozalash pastdagi triggerlar orqali.

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('follow', 'helpful', 'club_post', 'club_reply', 'new_book', 'weekly')),
  actor_id uuid references auth.users (id) on delete cascade,
  book_id bigint references public.books (id) on delete cascade,
  club_id bigint,
  post_id bigint,
  ref_date date, -- weekly: hafta boshi (dushanba)
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_actor_idx on public.notifications (actor_id) where actor_id is not null;
create index if not exists notifications_book_idx on public.notifications (book_id) where book_id is not null;
create index if not exists notifications_club_idx on public.notifications (club_id, user_id) where club_id is not null;
create index if not exists notifications_post_idx on public.notifications (post_id) where post_id is not null;
-- Takror yozilmasin: kuzatishni bekor qilib qayta bosish yoki ovozni qayta berish yangi bildirishnoma yaratmaydi
create unique index if not exists notifications_follow_key on public.notifications (user_id, actor_id) where kind = 'follow';
create unique index if not exists notifications_helpful_key on public.notifications (user_id, actor_id, book_id) where kind = 'helpful';
create unique index if not exists notifications_new_book_key on public.notifications (user_id, book_id) where kind = 'new_book';
create unique index if not exists notifications_weekly_key on public.notifications (user_id, ref_date) where kind = 'weekly';

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;

-- ============================================================
-- Triggerlar. Bildirishnoma yozilmay qolsa ham asosiy amal (kuzatish, ovoz, xabar) bajarilishi kerak.
-- ============================================================
create or replace function public.notify_follow()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, kind, actor_id)
  values (new.following_id, 'follow', new.follower_id)
  on conflict do nothing;
  return new;
exception when others then
  return new;
end
$$;

create or replace function public.notify_review_vote()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, kind, actor_id, book_id)
  select ub.user_id, 'helpful', new.user_id, ub.book_id
  from public.user_books ub
  where ub.id = new.user_book_id and ub.user_id <> new.user_id
  on conflict do nothing;
  return new;
exception when others then
  return new;
end
$$;

-- Yangi mavzu — klubning boshqa aʼzolariga; javob — faqat oʻsha xabar muallifiga (hali aʼzo boʻlsa)
create or replace function public.notify_club_post()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_id is null then
    insert into public.notifications (user_id, kind, actor_id, club_id, post_id)
    select m.user_id, 'club_post', new.user_id, new.club_id, new.id
    from public.club_members m
    where m.club_id = new.club_id and m.user_id <> new.user_id;
  else
    insert into public.notifications (user_id, kind, actor_id, club_id, post_id)
    select p.user_id, 'club_reply', new.user_id, new.club_id, new.id
    from public.club_posts p
    where p.id = new.parent_id
      and p.user_id <> new.user_id
      and exists (select 1 from public.club_members m where m.club_id = new.club_id and m.user_id = p.user_id);
  end if;
  return new;
exception when others then
  return new;
end
$$;

-- Xabar yoki klub oʻchsa, aʼzo klubdan chiqsa — tegishli bildirishnomalar ham ketadi
-- (yopiq klubning nomi chiqib ketgan odamga koʻrinib qolmasin).
create or replace function public.notifications_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'club_posts' then
    delete from public.notifications where post_id = old.id;
  elsif tg_table_name = 'clubs' then
    delete from public.notifications where club_id = old.id;
  elsif tg_table_name = 'club_members' then
    delete from public.notifications where club_id = old.club_id and user_id = old.user_id;
  end if;
  return old;
end
$$;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify after insert on public.follows for each row execute function public.notify_follow();
drop trigger if exists review_votes_notify on public.review_votes;
create trigger review_votes_notify after insert on public.review_votes for each row execute function public.notify_review_vote();
drop trigger if exists club_posts_notify on public.club_posts;
create trigger club_posts_notify after insert on public.club_posts for each row execute function public.notify_club_post();
drop trigger if exists club_posts_notifications_cleanup on public.club_posts;
create trigger club_posts_notifications_cleanup after delete on public.club_posts for each row execute function public.notifications_cleanup();
drop trigger if exists clubs_notifications_cleanup on public.clubs;
create trigger clubs_notifications_cleanup after delete on public.clubs for each row execute function public.notifications_cleanup();
drop trigger if exists club_members_notifications_cleanup on public.club_members;
create trigger club_members_notifications_cleanup after delete on public.club_members for each row execute function public.notifications_cleanup();

-- ============================================================
-- Cron (service role): yangi kitoblar va haftalik xulosa
-- ============================================================
-- Faqat kuzatish boshlangandan KEYIN katalogga qoʻshilgan kitoblar "yangi" (lib/bot/reminders.ts dagi qoida bilan bir xil).
-- Yarim yildan eski bildirishnomalar shu yerda tozalanadi.
create or replace function public.notify_new_books()
returns integer language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  delete from public.notifications where created_at < now() - interval '180 days';

  insert into public.notifications (user_id, kind, book_id)
  select x.user_id, 'new_book', x.book_id
  from (
    select f.user_id, b.id as book_id, b.created_by
    from public.author_follows f
    join public.book_authors ba on ba.author_id = f.author_id
    join public.books b on b.id = ba.book_id
    where b.first_seen_at > now() - interval '8 days' and b.first_seen_at >= f.created_at
    union
    select f.user_id, b.id, b.created_by
    from public.publisher_follows f
    join public.books b on b.publisher_id = f.publisher_id
    where b.first_seen_at > now() - interval '8 days' and b.first_seen_at >= f.created_at
  ) x
  where x.created_by is distinct from x.user_id
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end
$$;

-- p_week_start — dushanba (Toshkent vaqti). Shu haftada kamida bir marta oʻqiganlarga.
create or replace function public.notify_weekly_summary(p_week_start date)
returns integer language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  insert into public.notifications (user_id, kind, ref_date)
  select distinct s.user_id, 'weekly', p_week_start
  from public.reading_sessions s
  where s.delta > 0
    and s.created_at >= (p_week_start::timestamp at time zone 'Asia/Tashkent')
    and s.created_at < ((p_week_start + 7)::timestamp at time zone 'Asia/Tashkent')
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end
$$;

-- ============================================================
-- Sayt uchun oʻqish
-- ============================================================
-- "Foydali" ovozlari va klubdagi yangi xabarlar kun boʻyicha bittaga yigʻiladi (n — nechta).
-- Kim ekani: "Foydali"da hech qachon; kuzatuvchida — faqat profili ochiq boʻlsa; klubdagi javobda — har doim
-- (klub ichida aʼzolar ismi bir-biriga koʻrinadi).
create or replace function public.my_notifications(p_limit integer default 50)
returns table (
  id bigint,
  kind text,
  created_at timestamptz,
  unread boolean,
  n integer,
  actor_name text,
  actor_username text,
  actor_avatar text,
  book_slug text,
  book_title text,
  book_cover text,
  club_slug text,
  club_name text,
  post_id bigint,
  ref_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select x.*
    from public.notifications x
    where x.user_id = (select auth.uid()) and x.created_at > now() - interval '90 days'
  ),
  rolled as (
    select max(m.id) as id, m.kind, max(m.created_at) as created_at, bool_or(m.read_at is null) as unread, count(*)::integer as n,
           null::uuid as actor_id, m.book_id, m.club_id, null::bigint as post_id, null::date as ref_date
    from mine m
    where m.kind in ('helpful', 'club_post')
    group by m.kind, m.book_id, m.club_id, (m.created_at at time zone 'Asia/Tashkent')::date
    union all
    select m.id, m.kind, m.created_at, m.read_at is null, 1, m.actor_id, m.book_id, m.club_id, m.post_id, m.ref_date
    from mine m
    where m.kind not in ('helpful', 'club_post')
  )
  select r.id, r.kind, r.created_at, r.unread, r.n,
         case when r.kind = 'club_reply' or p.is_public then coalesce(nullif(btrim(p.display_name), ''), '@' || p.username) end,
         case when p.is_public then p.username end,
         case when r.kind = 'club_reply' or p.is_public then p.avatar_url end,
         b.slug, b.title, b.cover_url,
         c.slug, c.name,
         r.post_id, r.ref_date
  from rolled r
  left join public.profiles p on p.id = r.actor_id
  left join public.books b on b.id = r.book_id
  left join public.clubs c on c.id = r.club_id
  where (r.kind not in ('club_post', 'club_reply') or c.id is not null)
    and (r.kind not in ('helpful', 'new_book') or b.id is not null)
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- Qoʻngʻiroqchadagi son: roʻyxatda nechta oʻqilmagan qator koʻrinsa — shuncha
create or replace function public.unread_notifications_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.my_notifications(100) x where x.unread;
$$;

create or replace function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now() where user_id = (select auth.uid()) and read_at is null;
$$;

-- Supabase yangi funksiyalarni hammaga ochadi — keraksizlarini yopamiz
revoke all on function public.notify_follow() from public, anon, authenticated;
revoke all on function public.notify_review_vote() from public, anon, authenticated;
revoke all on function public.notify_club_post() from public, anon, authenticated;
revoke all on function public.notifications_cleanup() from public, anon, authenticated;
revoke all on function public.notify_new_books() from public, anon, authenticated;
revoke all on function public.notify_weekly_summary(date) from public, anon, authenticated;
revoke all on function public.my_notifications(integer) from public, anon;
revoke all on function public.unread_notifications_count() from public, anon;
revoke all on function public.mark_notifications_read() from public, anon;
grant execute on function public.notify_new_books() to service_role;
grant execute on function public.notify_weekly_summary(date) to service_role;
grant execute on function public.my_notifications(integer) to authenticated;
grant execute on function public.unread_notifications_count() to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
