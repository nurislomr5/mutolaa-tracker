-- Eski "50 kitob" tizimi jadvallarini o'chirmasdan alohida `legacy` sxemaga ko'chiramiz.
-- `legacy` API orqali ochilmagan, shuning uchun ular saytdan ko'rinmaydi, lekin kerak bo'lsa qaytarish mumkin.
-- Butunlay o'chirish: drop schema legacy cascade;
create schema if not exists legacy;

alter table if exists public.reading_logs set schema legacy;
alter table if exists public.book_notes set schema legacy;
alter table if exists public.books set schema legacy;
