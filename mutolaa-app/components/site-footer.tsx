import { Container } from "@/components/ui/container";
import { uz } from "@/lib/i18n/uz";
import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border py-8 text-sm text-muted">
      <Container className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>
          © {site.name}
        </span>
        <span>
          {uz.footer.catalogSource}{" "}
          <a href={site.sourceUrl} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
            {site.sourceName}
          </a>
          . {uz.footer.disclaimer}
        </span>
      </Container>
    </footer>
  );
}
