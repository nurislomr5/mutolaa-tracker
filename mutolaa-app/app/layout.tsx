import type { Metadata } from "next";
import { Inter, Literata } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { site, siteUrl } from "@/lib/site";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

// latin-ext — oʻ/gʻ (ʻ) harflari uchun, cyrillic — kelajakdagi kirill interfeysi va kirillcha kitob nomlari uchun
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext", "cyrillic"],
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin", "latin-ext", "cyrillic"],
});

export const metadata: Metadata = {
  // nisbiy OG/canonical manzillar shu domenga bogʻlanadi
  metadataBase: new URL(siteUrl()),
  openGraph: { siteName: site.name, locale: "uz_UZ", type: "website" },
  twitter: { card: "summary_large_image" },
  title: {
    default: `${site.name} — oʻzbekcha kitob kuzatuvchisi`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  verification: {
    google: "Ey6O6VliM0hSZIAOlHQXWo47gZb6F5wgS16eGcPjiXc",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="uz"
      suppressHydrationWarning
      className={`${inter.variable} ${literata.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
