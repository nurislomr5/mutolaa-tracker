import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { buttonClasses } from "@/components/ui/button";
import { ScriptToggle } from "@/components/script-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserNav } from "@/components/user-nav";
import { uz } from "@/lib/i18n/uz";
import { site } from "@/lib/site";

const links = [
  { href: "/kitoblar", label: uz.nav.catalog },
  { href: "/javonim", label: uz.nav.shelves },
  { href: "/lenta", label: uz.nav.feed },
  { href: "/klublar", label: uz.clubs.nav },
  { href: "/qaydlar", label: uz.nav.notes },
  { href: "/statistika", label: uz.nav.stats },
  { href: "/skaner", label: uz.scanner.nav },
];

const MOBILE_BOTTOM = new Set(["/kitoblar", "/javonim", "/lenta"]);

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-serif text-lg font-semibold">
      <svg className="h-7 w-7 text-accent" viewBox="0 0 32 32" fill="none" aria-hidden>
        <path d="M10 4h12a2 2 0 0 1 2 2v21.1a.9.9 0 0 1-1.42.73L16 23.2l-6.58 4.63A.9.9 0 0 1 8 27.1V6a2 2 0 0 1 2-2Z" fill="currentColor" />
      </svg>
      {site.name}
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <Container className="flex h-14 items-center gap-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={buttonClasses({ variant: "ghost", size: "sm" })}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ScriptToggle />
          <ThemeToggle />
          <Suspense fallback={<span className="inline-block h-8 w-16" />}>
            <UserNav />
          </Suspense>
        </div>
      </Container>
      {/* Mobil: Kitoblar, Javonim, Lenta — pastki menyuda (components/bottom-nav.tsx); qolganlari shu qatorda */}
      <nav className="flex gap-1 overflow-x-auto border-t border-border px-4 py-2 md:hidden">
        {links.filter((l) => !MOBILE_BOTTOM.has(l.href)).map((l) => (
          <Link key={l.href} href={l.href} className={buttonClasses({ variant: "ghost", size: "sm", className: "shrink-0" })}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
