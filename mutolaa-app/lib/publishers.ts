// Nashriyot nomlarini birlashtirish qoidalari.
// Manbalar (Asaxiy) bir nashriyotni turlicha yozadi: "Sharq" va "\"Sharq\" NMAK", "PIR" va "Pir nashriyoti".
// Importer va "Kitob qoʻshish" formasi har bir nomni shu roʻyxat orqali asosiy nashriyotga bogʻlaydi,
// scripts/merge-publishers.ts esa bazadagi mavjud yozuvlarni birlashtiradi.
// Faqat aniq bir nashriyot boʻlganlarini qoʻshing — shubhali juftliklar (Factor Books / Factor Press) alohida qoladi.

import { slugify } from "@/lib/text/normalize";

// taxallus slug -> asosiy slug
export const PUBLISHER_ALIASES: Record<string, string> = {
  "sharq-nmak": "sharq",
  pir: "pir-nashriyoti",
  bukhara: "bukhara-books",
  maatbachi: "matbaachi",
  "adolat-milliy-huquqiy-axborot-markazi": "adolat",
  "turon-zamin": "turon-zamin-ziyo",
  "info-capital-group": "info-capital-books",
  "faktor-press-info": "factor-press",
  "sarmoya-books": "sarmoya",
  "imom-buxoriy-xalqaro-ilmiy-tadqiqot-markazi-nashriyoti": "imom-buxoriy-xalqaro-markazi",
  "scholastic-inc": "scholastic",
  "simon-schuster-ltd": "simon-schuster",
  // rus nashriyotlarining sho'ba nashrlari (imprint)
  eksmodetstvo: "eksmo",
  "alpina-pro": "alpina-publisher",
  "azbuka-attikus": "azbuka",
  "azbuka-klassika": "azbuka",
};

// Asosiy nashriyotlarning koʻrsatiladigan nomi (oʻzbek nashriyotlari — lotin yozuvida, toʻgʻri imlo bilan)
export const PUBLISHER_NAMES: Record<string, string> = {
  sharq: "Sharq",
  "pir-nashriyoti": "Pir nashriyoti",
  "bukhara-books": "Bukhara Books",
  matbaachi: "Matbaachi",
  adolat: "Adolat",
  "turon-zamin-ziyo": "Turon Zamin Ziyo",
  "info-capital-books": "Info Capital Books",
  "factor-press": "Factor Press",
  sarmoya: "Sarmoya",
  "imom-buxoriy-xalqaro-markazi": "Imom Buxoriy xalqaro markazi",
  scholastic: "Scholastic",
  "simon-schuster": "Simon & Schuster",
  "hilol-nashr": "Hilol-Nashr",
  akademnashr: "Akademnashr",
  ozbekiston: "Oʻzbekiston",
  "yangi-kitob": "Yangi kitob",
  "yangi-nashr": "Yangi nashr",
  "ilm-ziyo-zakovat": "Ilm-Ziyo-Zakovat",
  "adabiyot-uchqunlari": "Adabiyot uchqunlari",
  "azon-kitoblari": "Azon kitoblari",
  "davr-press": "Davr-Press",
  tamaddun: "Tamaddun",
  simbat: "Simbat",
  "qamar-media": "Qamar Media",
  "zabarjad-media": "Zabarjad Media",
  "humo-nashr": "Humo-Nashr",
  "gafur-gulom": "Gʻafur Gʻulom",
  navroz: "Navroʻz",
  "donish-chirogi": "Donish chirogʻi",
  qaldirgoch: "Qaldirgʻoch",
  "ozbekiston-milliy-ensiklopediyasi": "Oʻzbekiston milliy ensiklopediyasi",
  oqituvchi: "Oʻqituvchi",
  manaviyat: "Maʼnaviyat",
  "fan-va-talim": "Fan va taʼlim",
  "fargona-nashriyoti": "Fargʻona nashriyoti",
  yogdu: "Yogʻdu",
  "marifat-bitiklari": "Maʼrifat bitiklari",
  "ilm-fan-manaviyat": "Ilm-fan-maʼnaviyat",
  "vohdil-galla-barakasi": "Vohdil gʻalla barakasi",
  "yashil-yaproq-nashiryoti": "Yashil yaproq nashriyoti",
};

// Nashriyot nomidan asosiy slug (taxalluslarni hisobga olgan holda)
export function publisherSlug(name: string) {
  const slug = slugify(name);
  return PUBLISHER_ALIASES[slug] ?? slug;
}
