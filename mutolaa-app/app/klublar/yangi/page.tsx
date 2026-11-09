import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { uz } from "@/lib/i18n/uz";
import { ClubForm } from "../club-form";

// Mehmon proxy.ts orqali kirish sahifasiga yuboriladi
export const metadata: Metadata = { title: uz.clubs.newTitle, robots: { index: false } };

export default function NewClubPage() {
  return (
    <Container className="max-w-xl py-8 sm:py-10">
      <Link href="/klublar" className="text-sm text-muted hover:text-accent">
        ← {uz.clubs.title}
      </Link>
      <h1 className="mb-6 mt-2 font-serif text-3xl font-semibold">{uz.clubs.newTitle}</h1>
      <ClubForm />
    </Container>
  );
}
