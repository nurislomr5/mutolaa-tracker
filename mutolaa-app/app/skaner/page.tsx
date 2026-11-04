import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { uz } from "@/lib/i18n/uz";
import { Scanner } from "./scanner";

export const metadata: Metadata = { title: uz.scanner.title };

export default function ScannerPage() {
  return (
    <Container className="py-8 sm:py-10">
      <div className="mx-auto max-w-xl">
        <h1 className="font-serif text-3xl font-semibold">{uz.scanner.title}</h1>
        <p className="mb-6 mt-1 text-muted">{uz.scanner.subtitle}</p>
        <Scanner />
      </div>
    </Container>
  );
}
