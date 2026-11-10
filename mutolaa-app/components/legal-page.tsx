import Link from "next/link";
import { Container } from "@/components/ui/container";
import { formatDate } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import type { LegalDoc } from "@/lib/legal";
import { site } from "@/lib/site";

// Maxfiylik siyosati va foydalanish shartlari uchun umumiy koʻrinish (matn — lib/legal.ts da)
export function LegalPage({ doc, other }: { doc: LegalDoc; other: { href: string; label: string } }) {
  const t = uz.legal;
  return (
    <Container className="max-w-3xl py-8 sm:py-10">
      <h1 className="font-serif text-3xl font-semibold">{doc.title}</h1>
      <p className="mt-1 text-sm text-muted">{t.updated(formatDate(doc.updated) ?? doc.updated)}</p>
      <p className="mt-5 leading-relaxed">{doc.intro}</p>

      {doc.sections.map((section) => (
        <section key={section.heading} className="mt-8">
          <h2 className="font-serif text-xl font-semibold">{section.heading}</h2>
          {section.body.map((block, i) =>
            typeof block === "string" ? (
              <p key={i} className="mt-3 leading-relaxed">
                {block}
              </p>
            ) : (
              <ul key={i} className="mt-3 list-disc space-y-2 pl-5 leading-relaxed marker:text-muted">
                {block.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}

      <section className="mt-8">
        <h2 className="font-serif text-xl font-semibold">{t.contact}</h2>
        {site.contact && (
          <p className="mt-3 leading-relaxed">
            {t.contactLead}{" "}
            <a href={site.contact.url} className="font-medium text-accent hover:underline" data-no-translit>
              {site.contact.label}
            </a>
          </p>
        )}
        <p className="mt-3 leading-relaxed">{t.contactReport}</p>
      </section>

      <p className="mt-10 border-t border-border pt-5 text-sm">
        <Link href={other.href} className="font-medium text-accent hover:underline">
          {other.label} →
        </Link>
      </p>
    </Container>
  );
}
