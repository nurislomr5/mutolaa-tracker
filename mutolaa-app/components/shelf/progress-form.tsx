"use client";

import { useActionState, useState } from "react";
import { updateProgress } from "@/app/actions/shelf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { uz } from "@/lib/i18n/uz";
import { FORMATS, UNITS, type ProgressUnit, type ReadingFormat, type UserBook } from "@/lib/shelf-types";

const selectClass = "h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm";

// Format tanlanganda mos oʻlchov birligi
const UNIT_FOR: Record<ReadingFormat, ProgressUnit> = { paper: "pages", ebook: "percent", audio: "minutes" };

export function ProgressForm({
  userBook,
  audioMinutes,
  pageCount,
  compact = false,
}: {
  userBook: Pick<UserBook, "id" | "format" | "unit" | "current_value" | "total_value">;
  audioMinutes?: number | null;
  pageCount?: number | null; // qogʻoz nashr betlar soni (katalogdan)
  compact?: boolean;
}) {
  const t = uz.shelf;
  const [state, action, pending] = useActionState(updateProgress, null);
  const [format, setFormat] = useState<ReadingFormat>(userBook.format ?? "paper");
  const [unit, setUnit] = useState<ProgressUnit>(userBook.unit);
  const [current, setCurrent] = useState(String(userBook.current_value));
  const [total, setTotal] = useState(userBook.unit === "percent" ? "100" : String(userBook.total_value ?? ""));
  const [showConverter, setShowConverter] = useState(false);
  const [otherCurrent, setOtherCurrent] = useState("");
  const [otherTotal, setOtherTotal] = useState("");

  function changeFormat(f: ReadingFormat) {
    setFormat(f);
    const u = UNIT_FOR[f];
    changeUnit(u);
  }

  // Birlik oʻzgarsa, hozirgi joyni proporsional oʻgiramiz va jami qiymatni toʻldiramiz
  function changeUnit(u: ProgressUnit) {
    const pct = Number(total) > 0 ? Number(current) / Number(total) : 0;
    const nextTotal =
      u === "percent"
        ? 100
        : u === "minutes" && audioMinutes
          ? audioMinutes
          : u === "pages" && pageCount
            ? pageCount
            : u === unit
              ? Number(total)
              : 0;
    setUnit(u);
    setTotal(nextTotal ? String(nextTotal) : "");
    setCurrent(nextTotal ? String(Math.round(pct * nextTotal)) : "");
  }

  const converted =
    Number(otherCurrent) > 0 && Number(otherTotal) > 0 && Number(total) > 0
      ? Math.min(Number(total), Math.round((Number(otherCurrent) / Number(otherTotal)) * Number(total)))
      : null;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userBookId" value={userBook.id} />
      {!compact && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">
            {t.format}
            <select name="format" value={format} onChange={(e) => changeFormat(e.target.value as ReadingFormat)} className={selectClass}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {uz.format[f]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            {t.progress}
            <select name="unit" value={unit} onChange={(e) => changeUnit(e.target.value as ProgressUnit)} className={selectClass}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {t.unitLong[u]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {compact && (
        <>
          <input type="hidden" name="format" value={format} />
          <input type="hidden" name="unit" value={unit} />
        </>
      )}

      <div className="flex items-end gap-2">
        <label className="flex-1 text-xs text-muted">
          {t.current}
          <Input name="current" type="number" min={0} inputMode="numeric" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <span className="pb-2.5 text-muted">/</span>
        <label className="flex-1 text-xs text-muted">
          {t.total} ({t.unit[unit]})
          <Input
            name="total"
            type="number"
            min={1}
            inputMode="numeric"
            required
            readOnly={unit === "percent"}
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={pending}>
          {t.save}
        </Button>
      </div>

      {Number(total) > 0 && <Progress value={Number(current) || 0} max={Number(total)} />}

      {unit === "pages" && !compact && (
        <div>
          <button type="button" onClick={() => setShowConverter((v) => !v)} className="text-xs text-accent hover:underline">
            {t.converterToggle}
          </button>
          {showConverter && (
            <div className="mt-2 space-y-2 rounded-lg bg-surface-2 p-3">
              <p className="text-xs text-muted">{t.converterHint}</p>
              <div className="flex items-end gap-2">
                <label className="flex-1 text-xs text-muted">
                  {t.otherCurrent}
                  <Input type="number" min={0} value={otherCurrent} onChange={(e) => setOtherCurrent(e.target.value)} />
                </label>
                <label className="flex-1 text-xs text-muted">
                  {t.otherTotal}
                  <Input type="number" min={1} value={otherTotal} onChange={(e) => setOtherTotal(e.target.value)} />
                </label>
                <Button type="button" variant="secondary" disabled={converted === null} onClick={() => converted !== null && setCurrent(String(converted))}>
                  {converted !== null ? `→ ${converted}` : t.apply}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {state && <p className={state.ok ? "text-sm text-accent" : "text-sm text-danger"}>{state.ok ? state.message : state.error}</p>}
    </form>
  );
}
