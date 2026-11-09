-- Sahifa: Hilol-Nashr importeri (scripts/import-hilol.ts) katalogda yoʻq kitobni source = 'hilol' bilan yaratadi.
-- Qayta ishga tushirsa ham xavfsiz.
alter table public.books drop constraint if exists books_source_check;
alter table public.books add constraint books_source_check check (source in ('mutolaa', 'asaxiy', 'user', 'hilol'));
