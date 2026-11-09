-- Sahifa: "Xatoni bildirish" xabarlari jurnali.
-- Har bir xabar shu yerga yoziladi — soatlik cheklov shu jadval boʻyicha sanaladi (serverless'da xotiradagi
-- hisoblagich ishonchsiz: har soʻrov boshqa nusxaga tushishi mumkin). Faqat service role yozadi/oʻqiydi
-- (app/actions/report-book.ts), shuning uchun foydalanuvchi rollariga hech qanday huquq berilmaydi.

create table public.book_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id bigint not null references public.books (id) on delete cascade,
  message text not null check (char_length(message) between 3 and 1000),
  created_at timestamptz not null default now()
);

create index book_reports_user_created_idx on public.book_reports (user_id, created_at desc);
create index book_reports_book_idx on public.book_reports (book_id);

alter table public.book_reports enable row level security;
revoke all on public.book_reports from anon, authenticated;
