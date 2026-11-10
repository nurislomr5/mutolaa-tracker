# Xatchoʻp

Oʻzbek tilidagi kitobxonlik kuzatuvchisi: oʻqigan, oʻqiyotgan va oʻqimoqchi boʻlgan kitoblar, progress, qaydlar, statistika, obunalar, klublar va Telegram bot.

- Sayt: https://mutolaa-tracker.vercel.app
- Bot: [@mutolaa_tracker_bot](https://t.me/mutolaa_tracker_bot)
- Texnologiya: Next.js 16 (App Router, `cacheComponents`), Supabase (Postgres + Auth + Storage), Tailwind 4, Vercel

> Next.js 16'da API'lar oldingi versiyalardan farq qiladi. Kod yozishdan oldin `node_modules/next/dist/docs/` dagi qoʻllanmaga qarang (qarang: `AGENTS.md`).

## Katalog

Kitoblar uchta manbadan import qilinadi (faqat metamaʼlumot, manbaga havola bilan):

| Manba | Nima beradi | Buyruq |
| --- | --- | --- |
| Mutolaa (mutolaa.com) | audio va elektron kitoblar | `npm run import:mutolaa` |
| Asaxiy | qogʻoz kitoblar, narx, sotuvda borligi | `npm run import:asaxiy` |
| Hilol Nashr (hilolnashr.uz) | qogʻoz kitoblar, narx, sotuvda borligi | `npm run import:hilol` |

Bir asarning turli nashrlari `book_sources` jadvalida bitta kitobga birlashtiriladi (ISBN yoki "nom + muallif" boʻyicha). Foydalanuvchilar ham katalogda yoʻq kitobni qoʻsha oladi (`/kitob-qoshish`). Takroriy kitoblar `/admin/takrorlar` da birlashtiriladi.

Importerlar `--dry-run` (bazaga yozmasdan), `--limit N` va `--force` (hammasini qayta yuklash) bayroqlarini qabul qiladi.

## Ishga tushirish

```bash
npm install
npm run dev
```

`.env.local` faylida kerakli oʻzgaruvchilar:

| Oʻzgaruvchi | Vazifasi |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase loyihasi |
| `SUPABASE_SERVICE_ROLE_KEY` | server amallari va importerlar (maxfiy) |
| `NEXT_PUBLIC_APP_URL` | saytning toʻliq manzili (SEO, bot havolalari) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Telegram bot |
| `MY_TELEGRAM_ID` | admin Telegram ID |
| `ALERT_TELEGRAM_CHAT_ID` | xatolar haqida ogohlantirish chati (ixtiyoriy) |
| `CRON_SECRET` | `/api/cron/reminders` himoyasi |
| `GEMINI_API_KEY` | botdagi AI javoblar |

Diqqat: Windows'da eski tizim oʻzgaruvchilari `.env.local` ni bosib ketishi mumkin. Build xato bersa, ularni oʻchirib ishga tushiring:

```bash
env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY npm run build
```

## Tekshiruvlar

```bash
npm test          # vitest (jumladan PGlite'da barcha migratsiyalar va RLS testlari)
npm run typecheck
npm run lint
npm run build
```

CI (`.github/workflows/ci.yml`) har push'da lint, typecheck va testlarni ishga tushiradi.

## Baza

Migratsiyalar: `supabase/migrations/`. Ular prod bazaga Supabase SQL Editor orqali qoʻlda qoʻllanadi — **kod deploy qilinishidan oldin**, aks holda yangi kod mavjud boʻlmagan ustun yoki funksiyani soʻrab buziladi.

- Har bir yangi migratsiya `tests/db-access.test.ts` da sinaladi (rollar va ruxsatlar Supabase'ga oʻxshatilgan).
- PGlite superuser sifatida ishlaydi: SQL Editor'da ruxsat berilmaydigan buyruqlarni qoʻlda tekshiring.
- Bir-biriga bogʻlangan ikki jadvalni yana bogʻlaydigan jadval qoʻshilsa, PostgREST embed'lari noaniq boʻlib qoladi (PGRST201) — kodda aniq FK nomini yozing (`profiles!user_books_profile_fkey`).
- Supabase yangi funksiyalarni `anon` ga avtomatik ochadi — faqat kirganlar uchun boʻlganlarida `revoke` ni aniq yozing.

## Avtomatlashtirish (GitHub Actions)

| Workflow | Qachon | Nima qiladi |
| --- | --- | --- |
| `import-mutolaa.yml` | har dushanba 02:00 UTC | Mutolaa, Asaxiy va Hilol katalogini yangilaydi |
| `reminders.yml` | har soat | Telegram eslatmalari (`/api/cron/reminders`) |
| `ci.yml` | har push | lint, typecheck, testlar |

Kerakli secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, ixtiyoriy `TELEGRAM_BOT_TOKEN` va `ALERT_TELEGRAM_CHAT_ID` (yiqilganda Telegram'ga xabar).

## Boshqa buyruqlar

- `npm run bot:setup` — webhook, buyruqlar menyusi va Mini App tugmasini oʻrnatadi (bot buyruqlari oʻzgarganda qayta ishga tushiring)
- `npm run storage:setup` — muqovalar uchun `covers` bucket
- `npm run publishers:merge` — nashriyot nomlarini birlashtirish (`lib/publishers.ts`)
- `npm run icons` — PWA ikonkalari
