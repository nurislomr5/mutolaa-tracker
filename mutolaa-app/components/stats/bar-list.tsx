import Link from "next/link";

// Gorizontal ustunlar: nom — ustun — qiymat (bitta seriya, bitta rang; qiymat ustun uchida)
export function BarList({ items }: { items: { label: string; value: number; href?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label} className="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-3 text-sm" title={`${item.label}: ${item.value}`}>
          {item.href ? (
            <Link href={item.href} className="truncate text-muted hover:text-text">
              {item.label}
            </Link>
          ) : (
            <span className="truncate text-muted">{item.label}</span>
          )}
          <div className="flex items-center gap-2">
            {item.value > 0 && (
              <div className="h-3 rounded-r-[4px] bg-accent" style={{ width: `max(4px, calc(${(item.value / max) * 100}% - 2.5rem))` }} />
            )}
            <span className="shrink-0 tabular-nums">{item.value}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
