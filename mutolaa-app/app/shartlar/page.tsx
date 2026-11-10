import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { uz } from "@/lib/i18n/uz";
import { terms } from "@/lib/legal";

export const metadata: Metadata = { title: terms.title, description: terms.description, alternates: { canonical: "/shartlar" } };

export default function TermsPage() {
  return <LegalPage doc={terms} other={{ href: "/maxfiylik", label: uz.footer.privacy }} />;
}
