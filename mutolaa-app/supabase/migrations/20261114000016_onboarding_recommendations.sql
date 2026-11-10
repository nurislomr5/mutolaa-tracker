-- Xatchoʻp: tanishuv (sevimli ruknlar), shaxsiy tavsiyalar va "oʻxshash kitoblar". Qayta ishga tushirsa ham xavfsiz.
--
--   * profiles.onboarded_at  — tanishuv sahifasidan oʻtgan (yoki oʻtkazib yuborgan) vaqti. Ustun yopiq:
--                              faqat my_onboarding() / save_onboarding() orqali oʻqiladi va yoziladi.
--   * profile_topics         — foydalanuvchi tanlagan ruknlar. Shaxsiy: har kim faqat oʻzinikini koʻradi.
--   * similar_books()        — rukn va janrlari mos kitoblar (kam uchraydigan rukn koʻproq vazn beradi).
--   * recommended_books()    — kirgan foydalanuvchi uchun: tanlagan ruknlari + javonidagi kitoblar + kuzatgan mualliflari.

alter table public.profiles add column if not exists onboarded_at timestamptz;

-- Javonida kitobi bor eski foydalanuvchilar tanishuvdan oʻtgan hisoblanadi — ularni bezovta qilmaymiz
update public.profiles p
set onboarded_at = now()
where p.onboarded_at is null
  and exists (select 1 from public.user_books ub where ub.user_id = p.id);

create table if not exists public.profile_topics (
  user_id uuid not null references public.profiles (id) on delete cascade,
  topic_id bigint not null references public.topics (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

alter table public.profile_topics enable row level security;
drop policy if exists "o'z ruknlari" on public.profile_topics;
create policy "o'z ruknlari" on public.profile_topics for select to authenticated
  using (user_id = (select auth.uid()));
-- yozish faqat save_onboarding() orqali
revoke all on public.profile_topics from anon, authenticated;
grant select on public.profile_topics to authenticated;

create or replace function public.my_onboarding()
returns table (onboarded boolean, topic_ids bigint[])
language sql
stable
security definer
set search_path = public
as $$
  select p.onboarded_at is not null,
         coalesce((select array_agg(pt.topic_id order by pt.topic_id) from public.profile_topics pt where pt.user_id = p.id), '{}')
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.save_onboarding(p_topic_ids bigint[], p_yearly_goal integer default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ids bigint[] := coalesce(p_topic_ids, '{}');
begin
  if uid is null then
    raise exception 'Avval tizimga kiring';
  end if;
  if coalesce(array_length(ids, 1), 0) > 40 then
    raise exception 'Juda koʻp rukn';
  end if;

  delete from public.profile_topics where user_id = uid and not (topic_id = any (ids));
  insert into public.profile_topics (user_id, topic_id)
    select uid, t.id from public.topics t where t.id = any (ids)
    on conflict do nothing;

  update public.profiles
  set onboarded_at = coalesce(onboarded_at, now()),
      yearly_goal = case when p_yearly_goal between 1 and 1000 then p_yearly_goal else yearly_goal end
  where id = uid;
end
$$;

-- Oʻxshash kitoblar: umumiy rukn va janrlar boʻyicha. "Badiiy adabiyot" kabi deyarli hamma kitobda bor rukn
-- oʻxshashlik haqida kam narsa aytadi, shuning uchun vazn = ln(jami / shu rukndagi kitoblar soni).
-- Shu muallifning boshqa kitoblari chiqmaydi — ular sahifada alohida boʻlimda.
create or replace function public.similar_books(p_book_id bigint, p_limit integer default 12)
returns setof public.books
language sql
stable
set search_path = public
as $$
  with topic_w as (
    select bt.topic_id, ln((select count(distinct book_id) from public.book_topics)::numeric / count(*)) + 0.1 as w
    from public.book_topics bt
    group by bt.topic_id
  ),
  genre_w as (
    select bg.genre_id, ln((select count(distinct book_id) from public.book_genres)::numeric / count(*)) + 0.1 as w
    from public.book_genres bg
    group by bg.genre_id
  ),
  scored as (
    select s.book_id, sum(s.w) as score
    from (
      select o.book_id, w.w
      from public.book_topics mine
      join topic_w w on w.topic_id = mine.topic_id
      join public.book_topics o on o.topic_id = mine.topic_id
      where mine.book_id = p_book_id
      union all
      select o.book_id, w.w
      from public.book_genres mine
      join genre_w w on w.genre_id = mine.genre_id
      join public.book_genres o on o.genre_id = mine.genre_id
      where mine.book_id = p_book_id
    ) s
    where s.book_id <> p_book_id
    group by s.book_id
  )
  select b.*
  from scored s
  join public.books b on b.id = s.book_id
  where not exists (
    select 1
    from public.book_authors a1
    join public.book_authors a2 on a2.author_id = a1.author_id
    where a1.book_id = p_book_id and a2.book_id = b.id
  )
  order by s.score desc, b.mutolaa_reading_count desc nulls last, b.id
  limit greatest(1, least(coalesce(p_limit, 12), 48));
$$;

-- Tavsiyalar (ichki): sayt recommended_books() orqali, bot esa service role bilan toʻgʻridan-toʻgʻri chaqiradi.
--   qiziqish = tanlangan ruknlar (3 ball) + javondagi kitoblarning ruknlari (baho va holatga qarab, 4 ballgacha)
--   kitob bali = Σ qiziqish × rukn vazni, kuzatilgan muallifning kitobiga +2. Javondagi kitoblar chiqmaydi.
create or replace function public.recommend_books_for(p_user uuid, p_limit integer default 12)
returns setof public.books
language sql
stable
set search_path = public
as $$
  with topic_w as (
    select bt.topic_id, ln((select count(distinct book_id) from public.book_topics)::numeric / count(*)) + 0.1 as w
    from public.book_topics bt
    group by bt.topic_id
  ),
  mine as (
    select ub.book_id,
           case
             when ub.rating >= 4 then 1.5
             when ub.rating <= 2 then -0.5
             when ub.status = 'dnf' then 0
             when ub.status = 'want' then 0.75
             else 1
           end::numeric as w
    from public.user_books ub
    where ub.user_id = p_user
  ),
  liked as (
    select s.topic_id, sum(s.w) as w
    from (
      select pt.topic_id, 3.0::numeric as w from public.profile_topics pt where pt.user_id = p_user
      union all
      select bt.topic_id, m.w * 4 / greatest((select count(*) from mine), 1)
      from mine m
      join public.book_topics bt on bt.book_id = m.book_id
    ) s
    group by s.topic_id
    having sum(s.w) > 0
  ),
  scored as (
    select s.book_id, sum(s.score) as score
    from (
      select bt.book_id, l.w * w.w as score
      from liked l
      join topic_w w on w.topic_id = l.topic_id
      join public.book_topics bt on bt.topic_id = l.topic_id
      union all
      select ba.book_id, 2.0
      from public.author_follows af
      join public.book_authors ba on ba.author_id = af.author_id
      where af.user_id = p_user
    ) s
    where not exists (select 1 from mine m where m.book_id = s.book_id)
    group by s.book_id
  )
  select b.*
  from scored s
  join public.books b on b.id = s.book_id
  order by s.score desc, b.mutolaa_reading_count desc nulls last, b.id
  limit greatest(1, least(coalesce(p_limit, 12), 48));
$$;

create or replace function public.recommended_books(p_limit integer default 12)
returns setof public.books
language sql
stable
security definer
set search_path = public
as $$
  select * from public.recommend_books_for(auth.uid(), p_limit);
$$;

-- Supabase yangi funksiyalarni hammaga ochadi — keraksizlarini yopamiz
revoke all on function public.my_onboarding() from public, anon;
revoke all on function public.save_onboarding(bigint[], integer) from public, anon;
revoke all on function public.recommended_books(integer) from public, anon;
revoke all on function public.recommend_books_for(uuid, integer) from public, anon, authenticated;
grant execute on function public.my_onboarding() to authenticated;
grant execute on function public.save_onboarding(bigint[], integer) to authenticated;
grant execute on function public.recommended_books(integer) to authenticated;
grant execute on function public.recommend_books_for(uuid, integer) to service_role;
grant execute on function public.similar_books(bigint, integer) to anon, authenticated;
