# Sahifa (mutolaa-app) — Claude Code uchun ish rejasi

## Kontekst
- Loyiha: Next.js 16 + Supabase + Telegram bot. Papka: `mutolaa-app/`.
- Boshqa AI yordamchi (Gemini) audit rejasini bajargan va commit qilinmagan ko'p o'zgarishlar qoldirgan. Uning hisobotida "6 bosqich ham tugadi" deyilgan, lekin aslida asosan 1–3-bosqichlar bajarilgan.
- Loyiha egasi **dasturchi emas**. Har bosqichdan keyin unga nima qilinganini **oddiy tilda, texnik atamalarsiz** tushuntir (o'zbek tilida).

## Umumiy qoidalar (har doim amal qil)
1. Ishni `main` da emas, alohida git branch'da qil (masalan `fix/audit-followup`).
2. **Asosiy (production) Supabase bazasiga migratsiyani hech qachon to'g'ridan-to'g'ri qo'llama.** Avval Supabase branch yoki lokal bazada sina va egasidan ruxsat so'ra.
3. Har bosqich oxirida `npm test`, `npm run typecheck`, `npm run lint` va `npm run build` ni ishga tushir. Natijani o'zing tekshir, taxmin qilma.
4. Har bosqich alohida commit bo'lsin. Keyin **to'xta**, egasiga qisqa tushuntirish ber va keyingi bosqichga ruxsat so'ra.
5. Agar biror narsa noaniq bo'lsa yoki qaytarib bo'lmaydigan bo'lsa (ma'lumot o'chirish, production'ga deploy), avval so'ra.
6. `.env.local` dagi maxfiy kalitlarni chiqarma va commit qilma.

---

## 0-bosqich: Hozirgi holatni tekshirish (hech narsa o'zgartirmasdan)
- `git status` va `git diff --stat` bilan commit qilinmagan o'zgarishlar ro'yxatini ko'r.
- Yangi branch och va hozirgi o'zgarishlarni bitta "WIP: Gemini audit changes" commit'iga saqla (yo'qolmasligi uchun).
- `npm test`, `typecheck`, `lint`, `build` ni ishga tushir va natijani yoz.
- Egasiga xulosa: nechta fayl o'zgargan, nima ishlaydi, nima buzilgan.

**Natija:** barcha o'zgarishlar xavfsiz saqlangan, loyihaning haqiqiy holati ma'lum.

## 1-bosqich: "Xatoni bildirish" formasini himoyalash
Fayl: `app/actions/report-book.ts`
- Hozir uni tizimga kirmagan odam ham cheksiz chaqira oladi, xabarlar admin Telegramiga tushadi.
- Faqat tizimga kirgan foydalanuvchiga ruxsat ber.
- Tezlik cheklovi qo'sh (masalan bir foydalanuvchi uchun soatiga 5 ta). Loyihada mavjud rate-limit usulidan foydalan (`lib/bot/handlers.ts` dagi `allowBotRate` ga qara), kerak bo'lsa bazaga asoslangan oddiy cheklov yoz.
- `slug` haqiqatan bazadagi kitobga tegishli ekanini tekshir.

**Natija:** begona odam admin chatini spam qila olmaydi.

## 2-bosqich: Xavfsizlik migratsiyasini tekshirish
Fayl: `supabase/migrations/20261109000006_security_lockdown.sql`
Migratsiya `profiles` jadvalidan INSERT/DELETE/SELECT huquqlarini oladi va `telegram_link_tokens` ga faqat `user_id` yozishga ruxsat beradi. Quyidagilar buzilmasligini tekshir:
- Ro'yxatdan o'tishda profil qanday yaratiladi? (trigger `security definer` bo'lsa — yaxshi; ilova kodi `profiles` ga insert/upsert qilsa — buziladi).
- Kodda `profiles` dan `select("*")` yoki ruxsat berilmagan ustunlar (`last_reminded_on` va h.k.) foydalanuvchi client'i orqali o'qiladimi?
- `avatar_url` ni kim yangilaydi? (migratsiya foydalanuvchiga `avatar_url` ni yangilashga ruxsat bermaydi — auth callback foydalanuvchi client'i bilan yangilasa, buziladi).
- `telegram_link_tokens` ga insert qiluvchi kod faqat `user_id` yuboradimi, `token`/`expires_at` bazaning default qiymatidan olinadimi?
- `books`, `book_sources` va boshqa katalog jadvallariga foydalanuvchi client'i bilan yozadigan joy qolmaganini tekshir (faqat service role yozishi kerak).
- Topilgan muammolarni tuzat. Keyin migratsiyani **Supabase branch'da** qo'llab, saytni sinab ko'r: kirish, ro'yxatdan o'tish, sozlamalar, Telegram ulash, kitob qo'shish.

**Natija:** migratsiya production'ga qo'llashga tayyor (lekin qo'llashni egasi tasdiqlaydi).

## 3-bosqich: Egalik tekshiruvini to'ldirish
Fayl: `app/actions/shelf.ts`
- `addNote`: `userBookId` shu foydalanuvchiga tegishli ekanini tekshir.
- `toggleShelfBook`: `shelfId` shu foydalanuvchiniki ekanini tekshir.
- `createShelf` dagi `shelf_books` insert xatosini e'tiborsiz qoldirmasin.
- RLS siyosatlari ham shu holatlarni yopishini migratsiyalarda tekshir.

**Natija:** bir foydalanuvchi boshqasining javoniga yoki kitobiga tegolmaydi.

## 4-bosqich: Spoyler va savol javobini to'g'ri saqlash
Hozir spoyler taqriz matni oldiga prefiks (`SPOILER_PREFIX`) qilib, savol javobi esa `notes.content` ichiga qo'shib saqlanadi.
- Yangi migratsiya: `user_books.review_is_spoiler boolean default false`, `notes.answer text`.
- Mavjud ma'lumotlarni ko'chir (prefiksni olib tashlab, flagga o'tkaz; javobni `content` dan ajrat).
- Taqriz ko'rsatiladigan **barcha** joylarni yangila: kitob sahifasi, `getBookReviews`, lenta, profil, Telegram bot, eksport.
- `joinNoteAnswer` / `parseReviewSpoiler` kabi yordamchilarni olib tashla yoki faqat ko'chirish uchun qoldir.

**Natija:** spoyler belgisi hech qayerda matn ichida chiqib qolmaydi.

## 5-bosqich: Reja'dan qolgan kichik ishlar
- Nashriyot sahifasida `book_sources.publisher_id` orqali bog'langan kitoblarni ham sanash va ko'rsatish (`lib/catalog.ts`).
- `lib/stats.ts` dagi `getYearStats` ni PostgreSQL funksiyasiga (`get_user_year_stats`) ko'chirish.
- Katalogga "Til" va "Sotuvda mavjud" filtrlari.
- `scripts/import-hilol.ts` ni bir marta sinov rejimida (bazaga yozmasdan) ishga tushirib, natija to'g'riligini tekshirish.

## 6-bosqich: Katta yangi funksiyalar (har biri alohida sessiyada, egasi tanlaydi)
Bularni boshlashdan oldin egasidan qaysi biri muhimroq ekanini so'ra:
1. Telefon / Telegram Mini App uchun pastki menyu (Katalog, Javonim, +, Lenta, Profil)
2. Internetsiz ishlash (PWA offline, `public/sw.js`)
3. Telegram botga muqova/shtrix-kod rasmi yuborib kitob qo'shish
4. Taqrizga "Foydali" (layk) bosish
5. Goodreads CSV import
6. Kitobxonlik klublari
7. Admin: takroriy kitoblarni birlashtirish (`mergeBooks`)

---

## Egasiga hisobot shabloni (har bosqichdan keyin)
- **Nima qilindi:** 1–3 gap, oddiy tilda
- **Foydalanuvchi uchun nima o'zgardi:** saytda nimani sezadi
- **Tekshiruv:** testlar o'tdimi (haqiqiy natija)
- **Keyingi qadam:** nima qilamiz, ruxsat kerakmi
