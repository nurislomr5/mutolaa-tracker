import Link from "next/link";
import { FormatIcon } from "@/components/book/format-icons";
import type { BookSource } from "@/lib/catalog";
import { formatCount } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

export const SOURCE_NAMES: Record<BookSource["source"], string> = { mutolaa: "Mutolaa", asaxiy: "Asaxiy", hilol: "Hilol Nashr" };

// "Qayerdan olish": Mutolaa'da oʻqish/tinglash va doʻkonlardagi qogʻoz nashrlar (narx, mavjudlik, nashr tafsilotlari)
export function WhereToGet({ sources }: { sources: BookSource[] }) {
  const t = uz.book;
  if (!sources.length) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-serif text-xl font-semibold">{t.whereTitle}</h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {sources.map((s) => {
          const details = [
            s.publisher?.name,
            s.published_year,
            s.cover_type,
            s.page_count ? `${s.page_count} bet` : null,
            s.script ? t.script[s.script] : null,
            s.isbn ? `ISBN ${s.isbn}` : null,
          ].filter(Boolean);
          return (
            <li key={s.url} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {s.formats.map((f) => (
                    <FormatIcon key={f} format={f} className="h-4 w-4 text-muted" />
                  ))}
                  {SOURCE_NAMES[s.source]}
                  {s.source !== "mutolaa" && s.in_stock != null && (
                    <span className={cn("text-xs font-normal", s.in_stock ? "text-accent" : "text-muted")}>
                      · {s.in_stock ? t.inStock : t.outOfStock}
                    </span>
                  )}
                </p>
                {details.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted">
                    {s.publisher ? (
                      <Link href={`/nashriyot/${s.publisher.slug}`} className="hover:text-accent">
                        {s.publisher.name}
                      </Link>
                    ) : null}
                    {(s.publisher ? details.slice(1) : details).map((d) => ` · ${d}`)}
                  </p>
                )}
              </div>
              {s.price ? <span className="text-sm font-semibold">{t.price(formatCount(s.price))}</span> : null}
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
              >
                {s.source === "mutolaa" ? t.readOn : t.buyOn(SOURCE_NAMES[s.source])} ↗
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
