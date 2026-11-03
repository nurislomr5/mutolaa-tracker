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
