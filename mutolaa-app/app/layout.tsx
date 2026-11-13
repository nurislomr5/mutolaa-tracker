import type { Metadata, Viewport } from "next";
import { Inter, Literata } from "next/font/google";
import { Suspense } from "react";
import { Analytics } from "@/components/analytics";
import { BottomNav } from "@/components/bottom-nav";
import { OfflineSyncSlot } from "@/components/offline/offline-sync-slot";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { TelegramAutoLogin } from "@/components/telegram-auto-login";
import { PwaSetup } from "@/components/pwa/pwa-setup";
import { site, siteUrl } from "@/lib/site";
import { authHintScript, themeInitScript } from "@/lib/theme";
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
    default: `${site.name}: shaxsiy mutolaa kundaligi va kitoblar katalogi`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  // iOS: bosh ekranga qoʻshilganda nomi va toʻliq ekran rejimi (manifest esa app/manifest.ts da)
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "default" },
  verification: {
    google: "Ey6O6VliM0hSZIAOlHQXWo47gZb6F5wgS16eGcPjiXc",
  },
};

// Brauzer paneli va oʻrnatilgan ilova sarlavhasi rangi — sahifa foni bilan bir xil
export const viewport: Viewport = {
  // iPhone: pastki menyu "home indicator" chizigʻi ustida turishi uchun (env(safe-area-inset-bottom))
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#14120f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="uz"
      suppressHydrationWarning
      className={`${inter.variable} ${literata.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript + authHintScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <TelegramAutoLogin />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <BottomNav />
        <PwaSetup />
        <Suspense fallback={null}>
          <OfflineSyncSlot />
        </Suspense>
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
