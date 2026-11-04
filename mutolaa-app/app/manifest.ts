import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// Telefonga "ilova" sifatida oʻrnatish (PWA). Ikonkalar: npm run icons
export default function manifest(): MetadataRoute.Manifest {
  const icon = [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }];
  return {
    id: "/",
    name: `${site.name} — oʻzbekcha kitob kuzatuvchisi`,
    short_name: site.name,
    description: site.description,
    lang: "uz",
    dir: "ltr",
    start_url: "/javonim",
    scope: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#faf7f2",
    categories: ["books", "education", "lifestyle"],
    icons: [
      ...icon,
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Javonim", url: "/javonim", icons: icon },
      { name: "ISBN skaner", short_name: "Skaner", url: "/skaner", icons: icon },
      { name: "Statistika", url: "/statistika", icons: icon },
      { name: "Kitoblar", url: "/kitoblar", icons: icon },
    ],
  };
}
