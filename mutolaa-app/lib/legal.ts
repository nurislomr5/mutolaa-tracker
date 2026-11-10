import { site } from "@/lib/site";

// Maxfiylik siyosati va foydalanish shartlari matni. Sayt qanday ishlashi oʻzgarsa (yangi maʼlumot turi,
// yangi tashqi xizmat) — shu faylni va `updated` sanasini ham yangilang.

// Boʻlim tanasi: satr — xatboshi, massiv — roʻyxat
export type LegalSection = { heading: string; body: (string | string[])[] };
export type LegalDoc = { title: string; description: string; updated: string; intro: string; sections: LegalSection[] };

const sources = site.sources.map((s) => s.name).join(", ");

export const privacy: LegalDoc = {
  title: "Maxfiylik siyosati",
  description: `${site.name} sizdan qanday maʼlumot oladi, uni nima uchun ishlatadi va uni qanday oʻchirish mumkin.`,
  updated: "2026-11-10",
  intro: `${site.name} — kitobxonlik kundaligi. Bu yerda sizdan qanday maʼlumot olishimiz, uni nima uchun ishlatishimiz va uni qanday oʻchirishingiz mumkinligi sodda tilda yozilgan.`,
  sections: [
    {
      heading: "Qanday maʼlumot saqlaymiz",
      body: [
        [
          "Kirish maʼlumoti: email manzilingiz. Google orqali kirsangiz — Google hisobingizdagi ism, email va rasm. Telegram orqali kirsangiz — Telegram raqamingiz (ID), ismingiz va foydalanuvchi nomingiz. Parol saqlamaymiz — parol umuman ishlatilmaydi.",
          "Profil: siz kiritgan ism, foydalanuvchi nomi, yillik maqsad va eslatma sozlamalari.",
          "Kitobxonlik maʼlumoti: javoningizdagi kitoblar va ularning holati, progress va oʻqish vaqtlari, baho va taqrizlar, qayd va iqtiboslar.",
          "Boshqalar bilan bogʻliq maʼlumot: kimni kuzatayotganingiz, taqrizlarga bergan «Foydali» ovozlaringiz, klublarga aʼzoligingiz va muhokamadagi xabarlaringiz.",
          "Siz katalogga qoʻshgan kitoblar va muqova rasmlari, katalogdagi xato haqida yuborgan xabarlaringiz.",
          "Texnik maʼlumot: xosting xizmati server jurnallarida IP-manzil va brauzer turini qisqa muddat saqlaydi.",
          "Tashrif statistikasi: qaysi sahifa necha marta ochilgani, qaysi saytdan kelingani, mamlakat, qurilma va brauzer turi. Bu maʼlumot umumlashtirilgan holda yigʻiladi — u hisobingizga bogʻlanmaydi va sizni shaxsan aniqlamaydi, cookie ishlatilmaydi.",
          "Shikoyatlar: taqriz, klubdagi xabar yoki profil ustidan shikoyat yuborsangiz — shikoyat matni va kim yuborgani; sizning yozganingiz ustidan shikoyat tushsa — oʻsha matnning nusxasi. Shikoyatni faqat sayt maʼmuri koʻradi.",
        ],
        "Reklama kodlari va sizni saytdan saytga kuzatadigan vositalar oʻrnatilmagan.",
      ],
    },
    {
      heading: "Nima uchun ishlatamiz",
      body: [
        [
          "Javoningiz, progressingiz va qaydlaringizni saqlash hamda statistikangizni koʻrsatish uchun.",
          "Oʻzingiz yoqqan Telegram eslatmalarini yuborish uchun.",
          "Profilingizni ochiq qilgan boʻlsangiz — uni boshqalarga koʻrsatish uchun.",
          "Xatolarni tuzatish va saytni suiisteʼmoldan himoya qilish uchun.",
        ],
        "Maʼlumotingizni sotmaymiz, reklama uchun ishlatmaymiz va reklama tarmoqlariga bermaymiz.",
      ],
    },
    {
      heading: "Maʼlumotingizni kim koʻradi",
      body: [
        "Profil dastlab yopiq boʻladi — javoningizni faqat oʻzingiz koʻrasiz.",
        [
          "Profilni ochiq qilsangiz (Sozlamalar → «Profilim ochiq»), javoningiz, baholaringiz va taqrizlaringiz hammaga, jumladan qidiruv tizimlariga koʻrinadi.",
          "Qaydlar, iqtiboslar va progress tarixi har doim faqat sizga koʻrinadi.",
          "Klubga qoʻshilsangiz, ismingiz, klubning joriy kitobidagi progressingiz va muhokamadagi xabarlaringiz klub sahifasida koʻrinadi — profilingiz yopiq boʻlsa ham. Ochiq klub sahifasini istalgan odam koʻra oladi, yopiq klubni — faqat aʼzolari.",
          "Email manzilingiz va Telegram raqamingiz boshqa foydalanuvchilarga hech qachon koʻrsatilmaydi.",
        ],
      ],
    },
    {
      heading: "Tashqi xizmatlar",
      body: [
        "Sayt ishlashi uchun quyidagi xizmatlardan foydalanamiz. Maʼlumot ularga faqat koʻrsatilgan maqsadda uzatiladi:",
        [
          "Supabase — maʼlumotlar bazasi va kirish tizimi.",
          "Vercel — sayt xostingi va tashrif statistikasi (Vercel Web Analytics).",
          "Telegram — bot, eslatmalar va Telegram orqali kirish.",
          "GitHub — bazaning haftalik zaxira nusxalari shifrlangan holda shu yerda saqlanadi.",
          "Google — Google orqali kirish. Botga yuborgan matnli yoki ovozli xabaringiz uni tushunish uchun Google Gemini sunʼiy intellektiga uzatiladi; xabar bilan birga javoningizdagi kitoblar nomi ham yuboriladi. Bot xabarlarini oʻzimiz saqlamaymiz — faqat natija (progress yoki qayd) javoningizga yoziladi.",
          "Google Books va Open Library — kitobni ISBN boʻyicha qidirganda ularga faqat ISBN raqami yuboriladi.",
        ],
        "Bu xizmatlarning serverlari Oʻzbekistondan tashqarida joylashgan.",
      ],
    },
    {
      heading: "Cookie va qurilmangizdagi maʼlumot",
      body: [
        [
          "Cookie faqat hisobingizga kirgan holda qolishingiz uchun ishlatiladi. Reklama yoki kuzatuv cookie'lari yoʻq; tashrif statistikasi ham cookie'siz ishlaydi.",
          "Brauzeringiz xotirasida tanlagan mavzu (yorugʻ yoki qorongʻi), alifbo, oʻqish taymeri va internetsiz ishlash uchun javoningizning nusxasi saqlanadi. Bular faqat sizning qurilmangizda turadi; hisobdan chiqsangiz, javon nusxasi oʻchadi.",
        ],
      ],
    },
    {
      heading: "Maʼlumotni yuklab olish va oʻchirish",
      body: [
        [
          "Yuklab olish: javoningizni «Javonim» sahifasidan, qaydlaringizni «Qaydlar» sahifasidan fayl qilib yuklab olishingiz mumkin.",
          "Telegram'ni uzish: Sozlamalar → Telegram bot → «Uzish».",
          "Hisobni oʻchirish: Sozlamalar → «Hisobni oʻchirish». Profilingiz, javoningiz, progress, qayd va taqrizlaringiz, obuna va ovozlaringiz, klublardagi aʼzolik va xabarlaringiz, Telegram bogʻlanishi shu zahoti oʻchadi. Buni ortga qaytarib boʻlmaydi.",
        ],
        "Siz ochgan klublar hisobingiz bilan birga, butun muhokamasi bilan oʻchadi. Siz katalogga qoʻshgan kitoblar katalogda qoladi, lekin ular endi sizga bogʻlanmagan boʻladi. Bazaning haftalik zaxira nusxalarida (ular shifrlangan holda saqlanadi) maʼlumot yana 90 kungacha saqlanib turishi mumkin.",
        "Hisobni oʻchirgach, Telegram yoki email orqali qayta kirsangiz, yangi boʻsh hisob ochiladi.",
      ],
    },
    {
      heading: "Oʻzgarishlar",
      body: ["Bu sahifa yangilanishi mumkin; oxirgi yangilangan sana yuqorida koʻrsatilgan. Muhim oʻzgarish boʻlsa, saytda alohida xabar beramiz."],
    },
  ],
};

export const terms: LegalDoc = {
  title: "Foydalanish shartlari",
  description: `${site.name}dan foydalanish qoidalari: hisob, siz yozgan matnlar, katalog maʼlumoti va javobgarlik.`,
  updated: "2026-11-10",
  intro: `${site.name}dan foydalansangiz, quyidagi shartlarga rozi boʻlasiz. Ularni qisqa va sodda yozishga harakat qildik.`,
  sections: [
    {
      heading: "Xizmat haqida",
      body: [
        `${site.name} — oʻqigan, oʻqiyotgan va oʻqimoqchi boʻlgan kitoblaringizni kuzatish uchun bepul xizmat.`,
        [
          `${site.name} kitob sotmaydi, kitob matni yoki audiosini saqlamaydi va tarqatmaydi.`,
          `Katalogdagi maʼlumot (nom, muallif, muqova, narx, sotuvda borligi) ochiq manbalardan olinadi (${sources}) va manbaga havola bilan koʻrsatiladi.`,
          `${site.name} — mustaqil loyiha: u bu manbalarning rasmiy xizmati emas.`,
          "Narx va sotuvda borligi haqidagi maʼlumot eskirgan boʻlishi mumkin — xarid qilishdan oldin sotuvchining oʻz saytida tekshiring.",
        ],
      ],
    },
    {
      heading: "Hisobingiz",
      body: [
        [
          "Hisobga email, Google yoki Telegram orqali kirasiz. Ularga kirish huquqini oʻzingiz asraysiz.",
          "Boshqa odamning hisobidan foydalanmang va oʻzingizni boshqa shaxs qilib koʻrsatmang.",
          "Saytni avtomatik dasturlar bilan ommaviy koʻchirib olish yoki uning ishiga xalaqit berish mumkin emas.",
        ],
      ],
    },
    {
      heading: "Siz yozgan matnlar",
      body: [
        "Taqriz, klubdagi xabar va katalogga qoʻshgan kitoblaringiz uchun oʻzingiz javobgarsiz. Ular sizniki boʻlib qoladi; ularni saytda koʻrsatishimizga ruxsat berasiz.",
        "Quyidagilarni yozmang va yuklamang:",
        [
          "haqorat, tahdid, kamsitish yoki nafrat uygʻotuvchi matnlar;",
          "reklama va spam;",
          "qonunga zid materiallar;",
          "mualliflik huquqi bilan himoyalangan kitoblarning toʻliq matni yoki katta qismlari (qisqa iqtibos mumkin);",
          "mavjud boʻlmagan yoki ataylab notoʻgʻri kiritilgan kitoblar.",
        ],
        "Qoidani buzgan matnni oʻchirishimiz, takrorlansa — hisobni yopishimiz mumkin.",
      ],
    },
    {
      heading: "Mualliflik huquqi egalari uchun",
      body: [
        "Agar siz muallif, nashriyot yoki doʻkon vakili boʻlsangiz va kitobingiz haqidagi maʼlumot yoki muqova katalogdan olib tashlanishini yoxud tuzatilishini istasangiz — bizga yozing, tezda bajaramiz.",
      ],
    },
    {
      heading: "Kafolat va javobgarlik",
      body: [
        [
          "Xizmat «boricha» taqdim etiladi: u vaqtincha ishlamay qolishi, imkoniyatlari oʻzgarishi yoki toʻxtatilishi mumkin.",
          "Telegram bot xabaringizni sunʼiy intellekt yordamida tushunadi va baʼzan xato qilishi mumkin — yozilgan progress va qaydlarni tekshirib turing.",
          "Muhim qayd va roʻyxatlaringizni vaqti-vaqti bilan yuklab olib turing.",
          "Qonun yoʻl qoʻygan doirada, xizmatdan foydalanish yoki foydalana olmaslik oqibatida koʻrilgan zarar uchun javobgar emasmiz.",
        ],
      ],
    },
    {
      heading: "Hisobni yopish",
      body: ["Istalgan payt Sozlamalar → «Hisobni oʻchirish» orqali hisobingizni va unga bogʻliq maʼlumotni oʻchirishingiz mumkin. Batafsil — maxfiylik siyosatida."],
    },
    {
      heading: "Oʻzgarishlar",
      body: ["Shartlar yangilanishi mumkin; oxirgi yangilangan sana yuqorida koʻrsatilgan. Yangilanishdan keyin saytdan foydalanishda davom etsangiz, yangi shartlarga rozi boʻlgan hisoblanasiz."],
    },
  ],
};
