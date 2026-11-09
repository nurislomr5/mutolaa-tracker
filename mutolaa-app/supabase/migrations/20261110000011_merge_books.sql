-- Sahifa: takroriy kitoblarni birlashtirish (admin). Qayta ishga tushirsa ham xavfsiz.
-- Hammasi faqat service role orqali (app/actions/admin-books.ts admin ekanini tekshirgandan keyin chaqiradi).

-- ============================================================
-- 1. Admin belgisi — foydalanuvchi rollariga ustun grant'i berilmagan (oʻqiy ham, oʻzgartira ham olmaydi)
-- ============================================================
alter table public.profiles add column if not exists is_admin boolean not null default false;
update public.profiles set is_admin = true where username = 'nurislom';

-- ============================================================
-- 2. Birlashtirilgan kitobning eski manzili -> yangi kitob (/kitob/<eski-slug> yoʻnaltiriladi;
--    Mutolaa importeri bu slug'larni qayta yaratmaydi)
-- ============================================================
create table if not exists public.book_redirects (
  old_slug text primary key,
  book_id bigint not null references public.books (id) on delete cascade,
  merged_at timestamptz not null default now()
);
create index if not exists book_redirects_book_idx on public.book_redirects (book_id);
alter table public.book_redirects enable row level security;
drop policy if exists "yoʻnaltirishlarni oʻqish" on public.book_redirects;
create policy "yoʻnaltirishlarni oʻqish" on public.book_redirects for select to anon, authenticated using (true);
revoke all on public.book_redirects from anon, authenticated;
grant select on public.book_redirects to anon, authenticated;

-- "Takror emas" deb belgilangan juftliklar (book_a < book_b)
create table if not exists public.book_duplicate_dismissals (
  book_a bigint not null references public.books (id) on delete cascade,
  book_b bigint not null references public.books (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (book_a, book_b),
  check (book_a < book_b)
);
alter table public.book_duplicate_dismissals enable row level security;
revoke all on public.book_duplicate_dismissals from anon, authenticated;

-- ============================================================
-- 3. Nom kaliti: qavs ichidagi raqamsiz izoh ("(kirill)", "(yumshoq muqova)") olib tashlanadi,
--    raqamli izoh ("(1-jild)") va til izohi ("(nemis tilida)", "(на русском языке)") qoladi —
--    jildlar va tarjimalar alohida kitob; lotin/kirill farqi uz_normalize bilan yoʻqoladi
-- ============================================================
create or replace function public.book_title_key(title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      public.uz_normalize(regexp_replace(
        regexp_replace(coalesce(title, ''), '\(([^)]*(tilida|тилида|tilda|языке|language)[^)]*)\)', ' \1 ', 'gi'),
        '\([^)0-9]*\)', ' ', 'g')),
      '[^a-z0-9 ]', ' ', 'g'),
    '\s+', ' ', 'g'))
$$;

create or replace function public.book_author_key(author_names text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(
    regexp_replace(public.uz_normalize(split_part(coalesce(author_names, ''), ',', 1)), '[^a-z ]', ' ', 'g'),
    '\s+', ' ', 'g')), '')
$$;

-- Kalitlar kitob jadvalida saqlanadi (nomzodlarni qidirish har safar 12 ming nomni qayta hisoblamasin)
alter table public.books add column if not exists title_key text generated always as (public.book_title_key(title)) stored;
alter table public.books add column if not exists author_key text generated always as (public.book_author_key(author_names)) stored;
create index if not exists books_title_key_idx on public.books (title_key);

-- ============================================================
-- 4. Ehtimoliy takrorlar: (a) bir xil nom kaliti va mos muallif (teng, biri ikkinchisini oʻz ichiga oladi
--    yoki biri koʻrsatilmagan), (b) bir xil ISBN — faqat nomlar deyarli bir xil (≥0.9) va nomdagi raqamlar
--    (jild, qism) teng boʻlsa: manbalarda bitta ISBN bir seriyaning turli jildlariga ham yozilgan
-- ============================================================
create or replace function public.book_duplicate_candidates(p_limit integer default 100)
returns table (book_a bigint, book_b bigint, reason text)
language sql
stable
set search_path = public, extensions
as $$
  with isbns as (
    select id as book_id, isbn_digits from public.books where isbn_digits is not null
    union
    select book_id, isbn_digits from public.book_sources where isbn_digits is not null
  ),
  by_isbn as (
    select distinct x.book_id as a, y.book_id as b, 'isbn'::text as reason
    from isbns x
    join isbns y on x.isbn_digits = y.isbn_digits and x.book_id < y.book_id
    join public.books kx on kx.id = x.book_id
    join public.books ky on ky.id = y.book_id
    where extensions.similarity(kx.title_key, ky.title_key) >= 0.9
      and regexp_replace(kx.title_key, '[^0-9]+', ' ', 'g') = regexp_replace(ky.title_key, '[^0-9]+', ' ', 'g')
  ),
  by_title as (
    select x.id as a, y.id as b, 'nom'::text as reason
    from public.books x join public.books y on x.title_key = y.title_key and x.id < y.id
    where length(x.title_key) >= 3
      and (x.author_key is null or y.author_key is null or x.author_key = y.author_key
           or strpos(x.author_key, y.author_key) > 0 or strpos(y.author_key, x.author_key) > 0)
  ),
  pairs as (
    select a, b, string_agg(reason, '+' order by reason) as reason
    from (select * from by_isbn union all select * from by_title) p
    group by a, b
  )
  select p.a, p.b, p.reason
  from pairs p
  where not exists (select 1 from public.book_duplicate_dismissals d where d.book_a = p.a and d.book_b = p.b)
  order by (p.reason like '%isbn%' and p.reason like '%nom%') desc, (p.reason like '%isbn%') desc, p.a, p.b
  limit greatest(1, least(coalesce(p_limit, 100), 500))
$$;

-- ============================================================
-- 5. Birlashtirish: p_source kitobining hamma bogʻlanishlari p_target ga koʻchadi, p_source oʻchiriladi.
--    Bitta foydalanuvchida ikkala nusxa boʻlsa — progressi koʻproq yozuv asos, boʻsh maydonlar ikkinchisidan,
--    qaydlar va oʻqish sessiyalari saqlanadi. Mutolaa kitobi har doim asosiy (importer uni slug boʻyicha yangilaydi).
-- ============================================================
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
revoke execute on function public.book_duplicate_candidates(integer) from public, anon, authenticated;
grant execute on function public.merge_books(bigint, bigint) to service_role;
grant execute on function public.book_duplicate_candidates(integer) to service_role;
