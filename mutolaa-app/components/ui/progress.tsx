export function progressPercent(value: number, max: number) {
  if (!max || max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

export function Progress({ value, max, label, className }: { value: number; max: number; label?: string; className?: string }) {
  const pct = progressPercent(value, max);
  return (
    <div className={className}>
      {label && (
        <div className="mb-1.5 flex justify-between text-xs">
          <span className="text-muted">{label}</span>
          <span className="font-semibold text-accent">{pct}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
