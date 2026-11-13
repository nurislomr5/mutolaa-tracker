-- Katalogni tozalash: rukn nomlari, Mutolaa slug'idagi apostrof izi, nomdagi doʻkon izlari,
-- apostrof turlari, xato yillar + nashriyotlar roʻyxatida oʻzbek tilidagi kitoblar soni.
-- Qoidalar lib/text/clean.ts dagi funksiyalarning SQL nusxasi (ikkalasi bir xil natija berishi shart) —
-- importerlar yangi kitoblarga oʻsha funksiyalarni qoʻllaydi.
-- Qayta ishga tushirish xavfsiz: ikkinchi safar hech narsa oʻzgarmaydi.

-- ============================================================
-- Yordamchi funksiyalar (faqat shu seans uchun — bazada qolmaydi)
-- ============================================================

-- normalizeApostrophes(): oʻ, gʻ -> ʻ (U+02BB); tutuq belgisi -> ʼ (U+02BC)
create or replace function pg_temp.fix_apostrophes(t text)
returns text language plpgsql immutable as $$
declare
  ap constant text := 'ʻʼ‘’`´''';
  s text;
begin
  if t is null then return null; end if;
  -- O'Konnor, O'Genri — ism ichidagi apostrof, oʻ emas
  s := regexp_replace(t, '(^|[^A-Za-z' || ap || '])O[' || ap || '](?=[A-Z][a-z])', '\1O' || chr(1), 'g');
  -- inglizcha egalik qoʻshimchasi: King's
  s := regexp_replace(s, '([Gg])[' || ap || '](?=s(?:[^A-Za-z]|$))', '\1' || chr(1), 'g');
  s := regexp_replace(s, '([OoGg])[' || ap || '](?=[A-Za-z])', '\1ʻ', 'g');
  -- soʻz oxiridagi gʻ (togʻ, bogʻ) — matnda tirnoqli qoʻshtirnoq boʻlmasa
  if t !~ ('(^|[^A-Za-z0-9' || ap || '])[' || ap || '][A-Za-z]') then
    s := regexp_replace(s, '([Gg])[' || ap || ']', '\1ʻ', 'g');
  end if;
  s := regexp_replace(s, '([A-FH-NP-Za-fh-np-z])[' || ap || '](?=[A-Za-z])', '\1ʼ', 'g');
  return replace(s, chr(1), 'ʼ');
end;
$$;

-- cleanTitle(): qavs ichidagi doʻkon izlarini ("(used)", "(Global books)", "[Asaxiy]") olib tashlash
create or replace function pg_temp.clean_title(t text, noise text[])
returns text language plpgsql immutable as $$
declare
  pieces text[];
  m text[];
  s text;
  i integer := 1;
  removed boolean := false;
begin
  if t is null or t !~ '[(\[]' then return t; end if;
  pieces := regexp_split_to_array(t, ' *[(\[][^()\[\]]*[)\]]');
  s := pieces[1];
  for m in select regexp_matches(t, '( *[(\[]([^()\[\]]*)[)\]])', 'g') loop
    i := i + 1;
    if public.uz_normalize(m[2]) = any (noise) then
      removed := true;
    else
      s := s || m[1];
    end if;
    s := s || coalesce(pieces[i], '');
  end loop;
  if not removed then return t; end if;
  s := regexp_replace(s, ' {2,}', ' ', 'g');
  s := regexp_replace(s, '^ +', '');
  s := regexp_replace(s, '[ ,;:–—-]+$', '');
  return case when s = '' then t else s end;
end;
$$;

-- titleNoise(): doimiy roʻyxat + nashriyotlar jadvalidagi nom va slug'lar
create or replace function pg_temp.title_noise()
returns text[] language sql stable as $$
  select array(
    select unnest(array[
      'used', 'original', 'premium sifat', 'yumshoq muqova', 'qattiq muqova', 'yumshoq', 'qattiq',
      'fleksibl muqova', 'super muqova', 'soft cover', 'soft', 'hard cover', 'hardcover', 'hard',
      'myagkaya', 'myakgaya', 'myagkiy', 'myagkie', 'myagkiy pereplyot', 'myagkiy pereplet',
      'tverdaya', 'tvyordiy', 'tverdiy', 'tvyordiy pereplyot', 'tvyordiy pereplet', 'tverdiy pereplet',
      'asaxiy', 'asaxiy books', 'azbuka klassika', 'mif', 'turon zamin', 'global books', 'global book',
      'penguin', 'penguin uk', 'hachette', 'palmyra classics', 'unicornbook', 'unicorn', 'ekmo', 'act', 'kapo',
      'bloomsbury', 'alpina pablisher', 'clever media', 'collins classics', 'harper collins', 'harpercollins',
      'yangi asr'
    ])
    union
    select k from (
      select public.uz_normalize(p.name) as k from public.publishers p
      union
      select public.uz_normalize(p.slug) from public.publishers p
    ) x where k <> ''
  );
$$;

-- cleanMutolaaSlug(): "o-tkan-kunlar" -> "otkan-kunlar", "she-rlar-31" -> "sherlar-31"
create or replace function pg_temp.clean_mutolaa_slug(p_slug text, p_title text)
returns text language plpgsql immutable as $$
declare
  base text := replace(public.uz_normalize(p_title), ' ', '-');
  letters text := replace(base, '-', '');
  head text;
  tail text;
begin
  if base = '' or base = p_slug or length(letters) > 250 then return p_slug; end if;
  if left(replace(p_slug, '-', ''), length(letters)) <> letters then return p_slug; end if;
  head := substring(p_slug from '^(?:-*[a-z0-9]){' || length(letters) || '}');
  if head is null then return p_slug; end if;
  tail := substr(p_slug, length(head) + 1);
  if tail = '' or left(tail, 1) = '-' then return base || tail; end if;
  return p_slug;
end;
$$;

-- saneYear(): 20241 -> 2024; 126, 256 (sahifa soni) -> null
create or replace function pg_temp.sane_year(y integer)
returns smallint language sql stable as $$
  select (case
    when y between 1400 and extract(year from now())::int + 1 then y
    when y between 10000 and 99999 and y / 10 between 1900 and extract(year from now())::int + 1 then y / 10
  end)::smallint;
$$;

-- ============================================================
-- 1. Rukn nomlari (manzillar — slug — oʻzgarmaydi)
-- ============================================================
update public.topics set name = 'IT va dasturlash' where slug = 'at' and name is distinct from 'IT va dasturlash';
update public.topics set name = 'Bolalar adabiyoti' where slug = 'bolalarbop' and name is distinct from 'Bolalar adabiyoti';
update public.topics set name = 'Diniy-maʼrifiy' where slug = 'diniy-marifiy' and name is distinct from 'Diniy-maʼrifiy';

-- ============================================================
-- 2. Mutolaa kitoblarining manzili: /kitob/o-tkan-kunlar -> /kitob/otkan-kunlar.
--    Eski manzil book_redirects orqali yangisiga yoʻnaltiriladi; Mutolaa'dagi asl slug
--    books.source_url va book_sources.external_id da qoladi (importer shu orqali taniydi).
-- ============================================================
do $$
declare
  r record;
  cand text;
  n integer;
begin
  for r in
    select b.id, b.slug, pg_temp.clean_mutolaa_slug(b.slug, b.title) as want
    from public.books b
    where b.source = 'mutolaa'
    order by b.id
  loop
    continue when r.want = r.slug;
    cand := r.want;
    n := 1;
    while exists (select 1 from public.books where slug = cand and id <> r.id)
       or exists (select 1 from public.book_redirects where old_slug = cand and book_id <> r.id) loop
      n := n + 1;
      cand := r.want || '-' || n;
    end loop;
    delete from public.book_redirects where old_slug = cand;
    update public.books set slug = cand where id = r.id;
    insert into public.book_redirects (old_slug, book_id) values (r.slug, r.id)
      on conflict (old_slug) do update set book_id = excluded.book_id;
  end loop;
end;
$$;

-- ============================================================
-- 3. Nomdagi doʻkon izlari: "Besh bolali yigitcha (Global books)" -> "Besh bolali yigitcha"
-- ============================================================
with n as materialized (select pg_temp.title_noise() as noise),
c as (
  select b2.id, pg_temp.clean_title(b2.title, n.noise) as title
  from public.books b2, n
  where b2.title ~ '[(\[]'
)
update public.books b
set title = c.title
from c
where c.id = b.id and c.title is distinct from b.title;

-- ============================================================
-- 4. Apostroflar: oʻzbek tilidagi kitoblar (nom, muallif, tavsif, oʻquvchi), mualliflar va nashriyotlar
-- ============================================================
update public.books b
set title = pg_temp.fix_apostrophes(b.title),
    author_names = pg_temp.fix_apostrophes(b.author_names),
    description = pg_temp.fix_apostrophes(b.description),
    narrator = pg_temp.fix_apostrophes(b.narrator)
where (
    b.source in ('mutolaa', 'user')
    or exists (select 1 from public.book_sources s where s.book_id = b.id and s.langs @> array['uz'])
  )
  and (b.title, b.author_names, b.description, b.narrator) is distinct from (
    pg_temp.fix_apostrophes(b.title),
    pg_temp.fix_apostrophes(b.author_names),
    pg_temp.fix_apostrophes(b.description),
    pg_temp.fix_apostrophes(b.narrator)
  );

update public.authors set name = pg_temp.fix_apostrophes(name) where name is distinct from pg_temp.fix_apostrophes(name);
update public.publishers set name = pg_temp.fix_apostrophes(name) where name is distinct from pg_temp.fix_apostrophes(name);

-- ============================================================
-- 5. Xato yillar (doʻkon sahifasidan notoʻgʻri oʻqilgan)
-- ============================================================
update public.books set published_year = pg_temp.sane_year(published_year)
where published_year is not null and published_year is distinct from pg_temp.sane_year(published_year);
update public.book_sources set published_year = pg_temp.sane_year(published_year)
where published_year is not null and published_year is distinct from pg_temp.sane_year(published_year);

-- ============================================================
-- 6. Nashriyotlar roʻyxati: jami kitoblar soni yonida oʻzbek tilidagi kitoblar soni (uz_count) —
--    bosh sahifa va /nashriyotlar oʻzbek nashriyotlarini birinchi koʻrsatadi
-- ============================================================
drop function if exists public.publisher_book_counts();
create function public.publisher_book_counts()
returns table (name text, slug text, count bigint, uz_count bigint)
language sql
stable
set search_path = ''
as $$
  select p.name, p.slug, count(distinct x.book_id), count(distinct x.book_id) filter (where x.uz)
  from public.publishers p
  join (
    select b.id as book_id, b.publisher_id,
      (b.source = 'mutolaa' or exists (
        select 1 from public.book_sources s2
        where s2.book_id = b.id and s2.langs @> array['uz']
          and (s2.publisher_id is null or s2.publisher_id = b.publisher_id)
      )) as uz
    from public.books b where b.publisher_id is not null
    union
    select s.book_id, s.publisher_id, s.langs @> array['uz']
    from public.book_sources s where s.publisher_id is not null
  ) x on x.publisher_id = p.id
  group by p.id, p.name, p.slug
$$;
revoke execute on function public.publisher_book_counts() from public;
grant execute on function public.publisher_book_counts() to anon, authenticated;

notify pgrst, 'reload schema';
