import Link from "next/link";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const LINKS = [
  { key: "panel", href: "/admin" },
  { key: "reports", href: "/admin/shikoyatlar" },
  { key: "duplicates", href: "/admin/takrorlar" },
] as const;

// Admin boʻlimlari orasidagi havolalar (sahifalarning oʻzi getAdminUser() bilan himoyalangan)
export function AdminNav({ current }: { current: (typeof LINKS)[number]["key"] }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 text-sm">
      {LINKS.map((l) => (
        <Link
          key={l.key}
          href={l.href}
          aria-current={l.key === current ? "page" : undefined}
          className={cn(
            "rounded-full border px-3 py-1 transition-colors",
            l.key === current ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-text",
          )}
        >
          {uz.admin.nav[l.key]}
        </Link>
      ))}
    </nav>
  );
}
