import { formatDate } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { addDays } from "@/lib/stats-utils";
import { ScrollToEnd } from "./scroll-to-end";

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT = 26; // hafta kunlari yorliqlari uchun joy
const TOP = 16; // oy nomlari uchun joy

// Kunlik sessiyalar soni -> 0..4 daraja (qatʼiy chegaralar: kunlar orasida taqqoslab boʻladi)
function level(count: number) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

const FILL = ["fill-surface-2", "fill-heat-1", "fill-heat-2", "fill-heat-3", "fill-heat-4"];

export function ActivityHeatmap({ year, activity, today }: { year: number; activity: Record<string, number>; today: string }) {
  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  // Hafta dushanbadan boshlanadi: 1-yanvar qaysi kunga tushishiga qarab grid boshini orqaga suramiz
  const firstWeekday = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const gridStart = addDays(first, -firstWeekday);

  const cells: { key: string; x: number; y: number; count: number; future: boolean }[] = [];
  const monthLabels: { x: number; label: string }[] = [];
  let week = 0;
  for (let d = gridStart; d <= last; d = addDays(d, 1)) {
    const weekday = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
    week = Math.floor((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${gridStart}T12:00:00Z`)) / (7 * 86_400_000));
    if (d < first) continue;
    if (d.endsWith("-01")) monthLabels.push({ x: LEFT + week * STEP, label: uz.stats.months[Number(d.slice(5, 7)) - 1] });
    cells.push({ key: d, x: LEFT + week * STEP, y: TOP + weekday * STEP, count: activity[d] ?? 0, future: d > today });
  }
  const width = LEFT + (week + 1) * STEP;
  const height = TOP + 7 * STEP;

  return (
    <div>
      {/* Telefonda grafik gorizontal aylantiriladi, sahifa emas */}
      <ScrollToEnd enabled={today.startsWith(String(year))} className="-mx-1 overflow-x-auto px-1 pb-2">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={uz.stats.activityTitle} className="block">
          {monthLabels.map((m) => (
            <text key={m.label} x={m.x} y={10} className="fill-muted text-[10px]">
              {m.label}
            </text>
          ))}
          {uz.stats.weekdays.map((w, i) =>
            w ? (
              <text key={i} x={0} y={TOP + i * STEP + CELL - 2} className="fill-muted text-[10px]">
                {w}
              </text>
            ) : null,
          )}
          {cells.map((c) => (
            <rect
              key={c.key}
              x={c.x}
              y={c.y}
              width={CELL}
              height={CELL}
              rx={2}
              className={FILL[level(c.count)]}
              opacity={c.future ? 0.4 : 1}
            >
              <title>{uz.stats.sessionsOn(formatDate(c.key) ?? c.key, c.count)}</title>
            </rect>
          ))}
        </svg>
      </ScrollToEnd>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-xs text-muted">
        {uz.stats.less}
        {FILL.map((f) => (
          <svg key={f} width={CELL} height={CELL} aria-hidden>
            <rect width={CELL} height={CELL} rx={2} className={f} />
          </svg>
        ))}
        {uz.stats.more}
      </div>
    </div>
  );
}
