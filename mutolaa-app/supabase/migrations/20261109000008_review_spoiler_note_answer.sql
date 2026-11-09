-- Sahifa: spoyler belgisi va savol javobi alohida ustunlarda.
-- Avval: spoyler taqriz matni oldiga "[spoiler]\n" prefiksi bilan, savol javobi esa notes.content ichiga
-- "\n\n💡 Javob: " belgisidan keyin qoʻshib saqlanardi — belgi matn ichida chiqib qolishi mumkin edi.
-- Qayta ishga tushirsa ham xavfsiz: ustunlar "if not exists", koʻchirish faqat prefiks/belgi bor qatorlarga tegadi.

alter table public.user_books add column if not exists review_is_spoiler boolean not null default false;
alter table public.notes add column if not exists answer text;

-- Koʻchirish taqriz/qayd sanasini (updated_at) oʻzgartirmasin — profil va lentadagi tartib saqlansin
alter table public.user_books disable trigger user_books_set_updated_at;
alter table public.notes disable trigger notes_set_updated_at;

-- Mavjud taqrizlar: prefiksni olib tashlab, flagga oʻtkazish
update public.user_books
set review = nullif(regexp_replace(substr(review, length(E'[spoiler]\n') + 1), '^\s+|\s+$', '', 'g'), ''),
    review_is_spoiler = true
where starts_with(review, E'[spoiler]\n');

-- Bo'sh taqrizda spoyler belgisi qolmasin
update public.user_books set review_is_spoiler = false where review is null and review_is_spoiler;

-- Mavjud qaydlar: javobni content'dan ajratish
update public.notes
set answer = coalesce(
      nullif(regexp_replace(substr(content, strpos(content, E'\n\n💡 Javob: ') + length(E'\n\n💡 Javob: ')), '^\s+|\s+$', '', 'g'), ''),
      answer
    ),
    content = regexp_replace(left(content, strpos(content, E'\n\n💡 Javob: ') - 1), '^\s+|\s+$', '', 'g')
where strpos(content, E'\n\n💡 Javob: ') > 0;

alter table public.user_books enable trigger user_books_set_updated_at;
alter table public.notes enable trigger notes_set_updated_at;
