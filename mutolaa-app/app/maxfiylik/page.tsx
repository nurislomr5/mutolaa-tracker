import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { uz } from "@/lib/i18n/uz";
import { privacy } from "@/lib/legal";

export const metadata: Metadata = { title: privacy.title, description: privacy.description, alternates: { canonical: "/maxfiylik" } };

export default function PrivacyPage() {
  return <LegalPage doc={privacy} other={{ href: "/shartlar", label: uz.footer.terms }} />;
}
