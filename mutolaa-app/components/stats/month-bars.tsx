import { uz } from "@/lib/i18n/uz";

const W = 600;
const H = 180;
const TOP = 18; // ustun ustidagi qiymat uchun joy
const BOTTOM = 22; // oy nomlari uchun joy
const BAR = 24; // ustun eni (≤ 24px)
const R = 4; // ustun uchi yumaloqligi

// Yuqori burchaklari yumaloq, asosi toʻgʻri ustun
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(R, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function MonthBars({ values, currentMonth }: { values: number[]; currentMonth: number | null }) {
  const max = Math.max(1, ...values);
  const slot = W / values.length;
  const plot = H - TOP - BOTTOM;
  const t = uz.stats;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[600px]" role="img" aria-label={t.monthlyTitle}>
        <line x1={0} x2={W} y1={H - BOTTOM} y2={H - BOTTOM} className="stroke-border" strokeWidth={1} />
        {values.map((v, i) => {
          const h = (v / max) * plot;
          const x = i * slot + (slot - BAR) / 2;
          const y = H - BOTTOM - h;
          return (
            <g key={i}>
              {/* hover nishoni ustundan kattaroq — butun oy oraligʻi */}
              <rect x={i * slot} y={TOP} width={slot} height={plot} fill="transparent">
                <title>{`${t.monthsLong[i]}: ${v}`}</title>
              </rect>
              {v > 0 && (
                <>
                  <path d={columnPath(x, y, BAR, h)} className="pointer-events-none fill-accent" />
                  <text x={x + BAR / 2} y={y - 5} textAnchor="middle" className="pointer-events-none fill-text text-[11px] font-medium">
                    {v}
                  </text>
                </>
              )}
              <text
                x={i * slot + slot / 2}
                y={H - 6}
                textAnchor="middle"
                className={i === currentMonth ? "fill-text text-[11px] font-semibold" : "fill-muted text-[11px]"}
              >
                {t.months[i]}
              </text>
            </g>
          );
        })}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs text-muted">{t.tableView}</summary>
        <table className="mt-2 w-full max-w-xs text-left tabular-nums">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 font-normal">{t.month}</th>
              <th className="py-1 text-right font-normal">{t.count}</th>
            </tr>
          </thead>
          <tbody>
            {values.map((v, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1">{t.monthsLong[i]}</td>
                <td className="py-1 text-right">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
