-- Sahifa: taqrizlarga "Foydali" ovozi. Qayta ishga tushirsa ham xavfsiz.
-- Ovoz faqat ochiq profildagi boshqa odamning taqriziga; kim ovoz bergani oshkor qilinmaydi — hamma faqat
-- sonini koʻradi (review_helpful_counts), har kim faqat oʻz ovozlarini oʻqiydi.

create table if not exists public.review_votes (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  user_book_id bigint not null references public.user_books (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, user_book_id)
);
create index if not exists review_votes_user_book_idx on public.review_votes (user_book_id);

alter table public.review_votes enable row level security;
drop policy if exists "oʻz ovozlari" on public.review_votes;
create policy "oʻz ovozlari" on public.review_votes for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "ovoz berish" on public.review_votes;
create policy "ovoz berish" on public.review_votes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.user_books ub join public.profiles p on p.id = ub.user_id
      where ub.id = review_votes.user_book_id
        and ub.review is not null
        and ub.user_id <> (select auth.uid())
        and p.is_public
    )
  );
drop policy if exists "ovozni qaytarish" on public.review_votes;
create policy "ovozni qaytarish" on public.review_votes for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.review_votes from anon, authenticated;
grant select, delete on public.review_votes to authenticated;
grant insert (user_book_id) on public.review_votes to authenticated;

-- Kitob taqrizlari boʻyicha ovozlar soni (kitob sahifasi; anonim klient ham chaqiradi)
create or replace function public.review_helpful_counts(p_book_id bigint)
returns table (user_book_id bigint, helpful integer)
language sql
stable
security definer
set search_path = ''
as $$
  select v.user_book_id, count(*)::integer
  from public.review_votes v
  join public.user_books ub on ub.id = v.user_book_id
  where ub.book_id = p_book_id
  group by v.user_book_id
$$;
revoke execute on function public.review_helpful_counts(bigint) from public;
grant execute on function public.review_helpful_counts(bigint) to anon, authenticated;

-- Takroriy kitoblarni birlashtirish: 20261110000011 dagi bilan bir xil, faqat ovozlar ham koʻchadi
create or replace function public.merge_books(p_target bigint, p_source bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.books%rowtype;
  s public.books%rowtype;
  moved_users integer := 0;
  merged_users integer := 0;
  pair record;
  keep_source boolean;
  src_mutolaa_id integer;
begin
  if p_target is null or p_source is null or p_target = p_source then
    raise exception 'merge_books: notoʻgʻri juftlik' using errcode = '22023';
  end if;
  select * into t from public.books where id = p_target for update;
  select * into s from public.books where id = p_source for update;
  if t.id is null or s.id is null then
    raise exception 'merge_books: kitob topilmadi' using errcode = 'P0002';
  end if;
  if s.source = 'mutolaa' and t.source <> 'mutolaa' then
    raise exception 'merge_books: Mutolaa kitobi asosiy boʻlishi kerak' using errcode = '22023';
  end if;

  -- Koʻchirish lenta va sanalarni oʻzgartirmasin
  alter table public.user_books disable trigger user_books_activity;
  alter table public.user_books disable trigger user_books_set_updated_at;

  -- Katalog bogʻlanishlari: mualliflar faqat asosiyda yoʻq boʻlsa; janr/rukn — birlashma
  if not exists (select 1 from public.book_authors where book_id = p_target) then
    insert into public.book_authors (book_id, author_id, position)
    select p_target, author_id, position from public.book_authors where book_id = p_source
    on conflict do nothing;
  end if;
  insert into public.book_genres (book_id, genre_id) select p_target, genre_id from public.book_genres where book_id = p_source on conflict do nothing;
  insert into public.book_topics (book_id, topic_id) select p_target, topic_id from public.book_topics where book_id = p_source on conflict do nothing;
  update public.book_sources set book_id = p_target where book_id = p_source;

  -- Ikkala nusxa ham bor foydalanuvchilar
  for pair in
    select ts.id as t_id, ss.id as s_id,
           ts.status as t_status, ss.status as s_status, ts.current_value as t_cur, ss.current_value as s_cur,
           ts.total_value as t_total, ss.total_value as s_total, ts.updated_at as t_upd, ss.updated_at as s_upd
    from public.user_books ts
    join public.user_books ss on ss.user_id = ts.user_id
    where ts.book_id = p_target and ss.book_id = p_source
  loop
    keep_source :=
      (case pair.s_status when 'read' then 4 when 'reading' then 3 when 'dnf' then 2 else 1 end,
       coalesce(pair.s_cur::numeric / nullif(pair.s_total, 0), 0), pair.s_upd)
      >
      (case pair.t_status when 'read' then 4 when 'reading' then 3 when 'dnf' then 2 else 1 end,
       coalesce(pair.t_cur::numeric / nullif(pair.t_total, 0), 0), pair.t_upd);
    if keep_source then
      update public.user_books ts set
        status = ss.status, format = ss.format, unit = ss.unit, current_value = ss.current_value,
        total_value = ss.total_value,
        started_at = coalesce(ss.started_at, ts.started_at), finished_at = coalesce(ss.finished_at, ts.finished_at),
        rating = coalesce(ss.rating, ts.rating),
        review = coalesce(ss.review, ts.review),
        review_is_spoiler = case when ss.review is not null then ss.review_is_spoiler else ts.review_is_spoiler end,
        updated_at = greatest(ts.updated_at, ss.updated_at)
      from public.user_books ss
      where ts.id = pair.t_id and ss.id = pair.s_id;
    else
      update public.user_books ts set
        started_at = coalesce(ts.started_at, ss.started_at), finished_at = coalesce(ts.finished_at, ss.finished_at),
        rating = coalesce(ts.rating, ss.rating),
        review = coalesce(ts.review, ss.review),
        review_is_spoiler = case when ts.review is not null then ts.review_is_spoiler else ss.review_is_spoiler end,
        updated_at = greatest(ts.updated_at, ss.updated_at)
      from public.user_books ss
      where ts.id = pair.t_id and ss.id = pair.s_id;
    end if;
    update public.notes set user_book_id = pair.t_id where user_book_id = pair.s_id;
    update public.reading_sessions set user_book_id = pair.t_id where user_book_id = pair.s_id;
    -- "Foydali" ovozlari: asosiy yozuvda aynan shu taqriz qolgan boʻlsa, ovozlar u bilan koʻchadi
    if (select review from public.user_books where id = pair.t_id) is not distinct from (select review from public.user_books where id = pair.s_id) then
      update public.review_votes v set user_book_id = pair.t_id
      where v.user_book_id = pair.s_id
        and not exists (select 1 from public.review_votes w where w.user_id = v.user_id and w.user_book_id = pair.t_id);
    end if;
    delete from public.user_books where id = pair.s_id;
    merged_users := merged_users + 1;
  end loop;

  -- Faqat ikkinchi nusxasi bor foydalanuvchilar — yozuv toʻliq koʻchadi (qaydlar va sessiyalar u bilan)
  update public.user_books set book_id = p_target where book_id = p_source;
  get diagnostics moved_users = row_count;

  alter table public.user_books enable trigger user_books_activity;
  alter table public.user_books enable trigger user_books_set_updated_at;

  update public.activities set book_id = p_target where book_id = p_source;
  insert into public.shelf_books (shelf_id, book_id, added_at)
    select shelf_id, p_target, added_at from public.shelf_books where book_id = p_source
    on conflict do nothing;
  insert into public.book_notifications (user_id, book_id, sent_at)
    select user_id, p_target, sent_at from public.book_notifications where book_id = p_source
    on conflict do nothing;
  update public.book_reports set book_id = p_target where book_id = p_source;
  delete from public.book_duplicate_dismissals where book_a = p_source or book_b = p_source;

  -- Eski manzil yoʻnaltirishi (avval shu kitobga yoʻnaltirilganlar ham yangi kitobga)
  update public.book_redirects set book_id = p_target where book_id = p_source;
  insert into public.book_redirects (old_slug, book_id) values (s.slug, p_target)
    on conflict (old_slug) do update set book_id = excluded.book_id, merged_at = now();

  src_mutolaa_id := s.mutolaa_id;
  delete from public.books where id = p_source;

  -- Asosiy kitobda yoʻq maʼlumotlar ikkinchisidan
  update public.books b set
    author_names = coalesce(b.author_names, s.author_names),
    description = coalesce(b.description, s.description),
    cover_url = coalesce(b.cover_url, s.cover_url),
    formats = array(select distinct f from unnest(b.formats || s.formats) f order by f),
    audio_seconds = coalesce(b.audio_seconds, s.audio_seconds),
    audio_chapters = coalesce(b.audio_chapters, s.audio_chapters),
    page_count = coalesce(b.page_count, s.page_count),
    narrator = coalesce(b.narrator, s.narrator),
    age_limit = coalesce(b.age_limit, s.age_limit),
    language = coalesce(b.language, s.language),
    publisher = coalesce(b.publisher, s.publisher),
    isbn = coalesce(b.isbn, s.isbn),
    publisher_id = coalesce(b.publisher_id, s.publisher_id),
    published_year = coalesce(b.published_year, s.published_year),
    script = coalesce(b.script, s.script),
    translator = coalesce(b.translator, s.translator),
    mutolaa_id = coalesce(b.mutolaa_id, src_mutolaa_id),
    mutolaa_rating = coalesce(b.mutolaa_rating, s.mutolaa_rating),
    mutolaa_rating_count = coalesce(b.mutolaa_rating_count, s.mutolaa_rating_count),
    mutolaa_reading_count = coalesce(b.mutolaa_reading_count, s.mutolaa_reading_count),
    first_seen_at = least(b.first_seen_at, s.first_seen_at)
  where b.id = p_target;

  return jsonb_build_object(
    'target', p_target, 'source', p_source, 'source_slug', s.slug, 'target_slug', t.slug,
    'moved_users', moved_users, 'merged_users', merged_users
  );
end;
$$;

revoke execute on function public.merge_books(bigint, bigint) from public, anon, authenticated;
grant execute on function public.merge_books(bigint, bigint) to service_role;
