import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { buttonClasses } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";

// Service worker internet yoʻqligida shu sahifani koʻrsatadi (public/sw.js)
export const metadata: Metadata = { title: uz.pwa.offlineTitle, robots: { index: false } };

export default function OfflinePage() {
  return (
    <Container className="py-24 text-center">
      <p className="text-5xl" aria-hidden>
        📡
      </p>
      <h1 className="mt-4 font-serif text-2xl font-semibold">{uz.pwa.offlineTitle}</h1>
      <p className="mx-auto mt-2 max-w-md text-muted">{uz.pwa.offlineBody}</p>
      {/* JS yuklanmagan boʻlishi mumkin — oddiy havola joriy manzilni qayta ochadi */}
      <a href="" className={buttonClasses({ className: "mt-8" })}>
        {uz.pwa.retry}
      </a>
    </Container>
  );
}
