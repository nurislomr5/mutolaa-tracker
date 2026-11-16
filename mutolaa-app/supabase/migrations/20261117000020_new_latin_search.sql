-- ============================================================
-- Qidiruv yangi lotin alifbosini ham tushunadi: ö = oʻ, ğ = gʻ, ş = sh, ç = ch.
-- "Ötkan kunlar", "Oʻtkan kunlar" va "Ўткан кунлар" — bitta qidiruv kaliti: "otkan kunlar".
-- TypeScript nusxasi: lib/text/normalize.ts (ikkalasi bir xil natija berishi shart).
-- Qayta ishga tushirsa boʻladi.
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
      replace(replace(replace(replace(
      replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
        -- so'z boshidagi kirill "е" -> "ye" (Ер -> yer)
        regexp_replace(lower(normalize(coalesce(input, ''), NFC)), '(^|[^а-яА-ЯёЁўЎқҚғҒҳҲ])[еЕ]', '\1ye', 'g'),
        'ё', 'yo'), 'Ё', 'yo'), 'ц', 'ts'), 'Ц', 'ts'), 'ч', 'ch'), 'Ч', 'ch'), 'ш', 'sh'), 'Ш', 'sh'),
        'щ', 'sh'), 'Щ', 'sh'), 'ю', 'yu'), 'Ю', 'yu'), 'я', 'ya'), 'Я', 'ya'),
        -- yangi lotin alifbosi
        'ş', 'sh'), 'Ş', 'sh'), 'ç', 'ch'), 'Ç', 'ch'),
      'абвгдежзийклмнопрстуфхыэўқғҳ' || 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЫЭЎҚҒҲ' || 'öğÖĞ' || 'ъьЪЬʻʼ‘’`´''',
      'abvgdejziyklmnoprstufxieoqgh' || 'abvgdejziyklmnoprstufxieoqgh' || 'ogog'
    ),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

-- Nomi yoki muallifida shu harflar bor kitoblar (asosan turkcha nashrlar) uchun saqlangan qidiruv matnini yangilash:
-- search_text — hisoblanadigan ustun, qator yangilanganda qaytadan hisoblanadi.
alter table public.books disable trigger books_set_updated_at;

update public.books
set title = title
where search_text is distinct from public.uz_normalize(coalesce(title, '') || ' ' || coalesce(author_names, ''));

alter table public.books enable trigger books_set_updated_at;
