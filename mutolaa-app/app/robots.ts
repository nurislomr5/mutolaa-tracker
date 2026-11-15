import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Katalog ochiq; shaxsiy va texnik sahifalar indekslanmaydi.
// Katalogda filtrlar birikmasi cheksiz ("?rukn=…&til=…&sahifa=…") — robot ularni aylanib chiqsa, har biri serverda
// yangi sahifa chizdiradi. Bitta filtrli sahifalar ochiq qoladi; kitoblarning oʻzi sitemap orqali topiladi.
// Sayt uchun foydasi yoʻq, lekin juda koʻp soʻrov yuboradigan robotlar butunlay yopiladi.
const HEAVY_BOTS = ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "BLEXBot", "DataForSeoBot", "PetalBot", "Bytespider"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: HEAVY_BOTS, disallow: "/" },
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/kitoblar?*&",
          "/kitoblar?q=",
          "/javonim",
          "/admin/",
          "/oflayn",
          "/klublar/yangi",
          "/klublar/taklif/",
          "/qaydlar",
          "/statistika",
          "/hafta",
          "/bildirishnomalar",
          "/tanishuv",
          "/sarhisob",
          "/sozlamalar",
          "/lenta",
          "/skaner",
          "/kitob-qoshish",
          "/kitob/*/tahrirlash",
          "/kirish",
          "/auth/",
          "/api/",
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
