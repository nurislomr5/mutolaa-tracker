-- Xatchoʻp: katalog qidiruvini tezlatish. Qayta ishga tushirsa ham xavfsiz.
--
-- Eski search_catalog bitta SQL soʻrov edi: "n.q = '' or like … or <% …" sharti tufayli trigram indeksi
-- ishlatilmas, har qidiruvda barcha kitoblar birma-bir solishtirilardi (~0,6 s). Endi ikki tarmoq:
--   * qidiruv soʻzi bor  → trigram indeksi orqali faqat mos kitoblar;
--   * qidiruv soʻzi yoʻq → faqat filtrlar, mashhurlik boʻyicha.
-- Imzo va natija tartibi oʻzgarmaydi (ilova kodi, bot va search_books shu funksiyani chaqiradi).

-- pg_trgm kutubxonasini shu seansda yuklash: aks holda Supabase SQL Editor (superuser emas) funksiyadagi
-- "set pg_trgm.word_similarity_threshold" ni rad etadi — "permission denied to set parameter"
select extensions.word_similarity('a', 'a');

create or replace function public.search_catalog(
  q text,
  p_publisher text default null,
  p_lang text default null,
  p_in_stock boolean default false
)
returns setof public.books
language plpgsql
stable
set search_path = public, extensions
set pg_trgm.word_similarity_threshold = 0.5
as $$
declare
  nq text := public.uz_normalize(q);
  pub_id bigint;
  need_edition boolean := p_lang is not null or coalesce(p_in_stock, false);
begin
  if p_publisher is not null then
    select p.id into pub_id from public.publishers p where p.slug = p_publisher;
    if pub_id is null then
      return;
    end if;
  end if;

  if nq = '' then
    return query
      select b.*
      from public.books b
      where (pub_id is null
             or b.publisher_id = pub_id
             or exists (select 1 from public.book_sources s where s.book_id = b.id and s.publisher_id = pub_id))
        and (not need_edition
             or exists (
               select 1 from public.book_sources s
               where s.book_id = b.id
                 and (p_lang is null or p_lang = any (s.langs))
                 and (not coalesce(p_in_stock, false) or s.in_stock)
             ))
      order by b.mutolaa_reading_count desc nulls last, b.id;
  else
    return query
      select b.*
      from public.books b
      where (b.search_text like '%' || nq || '%' or nq <% b.search_text)
        and (pub_id is null
             or b.publisher_id = pub_id
             or exists (select 1 from public.book_sources s where s.book_id = b.id and s.publisher_id = pub_id))
        and (not need_edition
             or exists (
               select 1 from public.book_sources s
               where s.book_id = b.id
                 and (p_lang is null or p_lang = any (s.langs))
                 and (not coalesce(p_in_stock, false) or s.in_stock)
             ))
      order by
        (b.search_text like nq || '%') desc,
        word_similarity(nq, b.search_text) desc,
        b.mutolaa_reading_count desc nulls last,
        b.id;
  end if;
end
$$;

grant execute on function public.search_catalog(text, text, text, boolean) to anon, authenticated;
