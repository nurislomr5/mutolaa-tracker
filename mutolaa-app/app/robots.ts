import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Katalog ochiq; shaxsiy va texnik sahifalar indekslanmaydi
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/javonim",
        "/admin/",
        "/qaydlar",
        "/statistika",
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
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
