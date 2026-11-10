-- Admin har qanday kitobni saytda tahrirlay oladi. Qoʻlda tuzatilgan kitob belgilanadi (edited_at),
-- shunda haftalik import (Mutolaa/Asaxiy) uning nomi, muallifi, tavsifi, muqovasi va nashriyotini qayta yozmaydi.
-- Katalog jadvallari anon/authenticated uchun faqat oʻqishga ochiq (006) — ustunni faqat service role yozadi.

alter table public.books add column if not exists edited_at timestamptz;

comment on column public.books.edited_at is 'Saytda qoʻlda tahrirlangan vaqt; toʻldirilgan boʻlsa import tahrirlangan maydonlarga tegmaydi';
