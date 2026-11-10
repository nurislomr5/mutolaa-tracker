import Link from "next/link";
import { Container } from "@/components/ui/container";
import { uz } from "@/lib/i18n/uz";
import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border py-8 text-sm text-muted">
      <Container className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <span className="flex shrink-0 flex-wrap gap-x-4 gap-y-1">
          <span>© {site.name}</span>
          <Link href="/maxfiylik" className="hover:text-text hover:underline">
            {uz.footer.privacy}
          </Link>
          <Link href="/shartlar" className="hover:text-text hover:underline">
            {uz.footer.terms}
          </Link>
        </span>
        <span className="sm:text-right">
          {uz.footer.catalogSource}{" "}
          {site.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && ", "}
              <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                {s.name}
              </a>
            </span>
          ))}
          . {uz.footer.disclaimer}
        </span>
      </Container>
    </footer>
  );
}
