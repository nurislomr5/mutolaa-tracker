import type { Metadata } from "next";
import { OfflineShelf } from "@/components/offline/offline-shelf";
import { Container } from "@/components/ui/container";
import { uz } from "@/lib/i18n/uz";

// Oflayn javon: maʼlumot serverdan emas, telefondagi nusxadan (IndexedDB) — service worker uni internetsiz ham ochadi
export const metadata: Metadata = { title: uz.offline.title, robots: { index: false } };

export default function OfflineShelfPage() {
  return (
    <Container className="py-8 sm:py-10">
      <h1 className="font-serif text-3xl font-semibold">{uz.offline.title}</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{uz.offline.intro}</p>
      <OfflineShelf />
    </Container>
  );
}
