"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { deleteReadingSession, updateProgress } from "@/app/actions/shelf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { FORMATS, UNITS, type ProgressUnit, type ReadingFormat, type ReadingSession, type UserBook } from "@/lib/shelf-types";

const selectClass = "h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm";

// Format tanlanganda mos oʻlchov birligi
const UNIT_FOR: Record<ReadingFormat, ProgressUnit> = { paper: "pages", ebook: "percent", audio: "minutes" };

function isoDayOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tashkent" }).format(d);
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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
  const [date, setDate] = useState("");

  // Oʻqish taymeri (localStorage da saqlanadi)
  const storageKey = `sahifa:timer:${userBook.id}`;
  const [running, setRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [timerNote, setTimerNote] = useState<string | null>(null);

  useEffect(() => {
    if (compact) return;
    const syncFromStorage = () => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        const saved = JSON.parse(raw) as { running?: boolean; startedAt?: number | null; accumulatedSec?: number };
        const acc = saved.accumulatedSec ?? 0;
        if (saved.running && saved.startedAt) {
          setRunning(true);
          setElapsedSec(acc + Math.max(0, Math.floor((Date.now() - saved.startedAt) / 1000)));
        } else if (acc > 0) {
          setElapsedSec(acc);
        }
      } catch {
        // ignore localStorage errors
      }
    };
    const id = setTimeout(syncFromStorage, 0);
    return () => clearTimeout(id);
  }, [compact, storageKey]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        const saved = JSON.parse(raw) as { running?: boolean; startedAt?: number | null; accumulatedSec?: number };
        if (saved.running && saved.startedAt) {
          setElapsedSec((saved.accumulatedSec ?? 0) + Math.max(0, Math.floor((Date.now() - saved.startedAt) / 1000)));
        }
      } catch {
        // ignore
      }
    }, 1000);
    return () => clearInterval(id);
  }, [running, storageKey]);

  function startTimer() {
    setTimerNote(null);
    setRunning(true);
    try {
      localStorage.setItem(storageKey, JSON.stringify({ running: true, startedAt: Date.now(), accumulatedSec: elapsedSec }));
    } catch {
      // ignore
    }
  }

  function pauseTimer() {
    setRunning(false);
    try {
      localStorage.setItem(storageKey, JSON.stringify({ running: false, startedAt: null, accumulatedSec: elapsedSec }));
    } catch {
      // ignore
    }
  }

  function resetTimer() {
    setRunning(false);
    setElapsedSec(0);
    setTimerNote(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }

  function finishTimer() {
    const mins = Math.max(1, Math.round(elapsedSec / 60));
    resetTimer();
    if (unit === "minutes") {
      const nextVal = Math.min(Number(total) || 1_000_000, (Number(current) || 0) + mins);
      setCurrent(String(nextVal));
    }
    setTimerNote(t.timerDoneHint(mins));
  }

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

  const todayIso = isoDayOffset(0);
  const yesterdayIso = isoDayOffset(-1);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userBookId" value={userBook.id} />
      {date && <input type="hidden" name="date" value={date} />}

      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">⏱ {t.timerTitle}:</span>
            <span className="font-mono text-base font-semibold text-accent">{fmtClock(elapsedSec)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {!running ? (
              <Button type="button" size="sm" variant="secondary" onClick={startTimer}>
                ▶ {t.timerStart}
              </Button>
            ) : (
              <Button type="button" size="sm" variant="secondary" onClick={pauseTimer}>
                ⏸ {t.timerPause}
              </Button>
            )}
            {elapsedSec > 0 && (
              <>
                <Button type="button" size="sm" onClick={finishTimer}>
                  ✓ {t.timerFinish}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={resetTimer}>
                  {t.timerReset}
                </Button>
              </>
            )}
          </div>
          {timerNote && <p className="w-full text-xs text-accent">{timerNote}</p>}
        </div>
      )}

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

      {!compact && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{t.sessionDate}:</span>
          <button
            type="button"
            onClick={() => setDate("")}
            className={`rounded-full border px-2.5 py-0.5 ${!date || date === todayIso ? "border-accent bg-accent/10 text-accent font-medium" : "border-border"}`}
          >
            {t.today}
          </button>
          <button
            type="button"
            onClick={() => setDate(yesterdayIso)}
            className={`rounded-full border px-2.5 py-0.5 ${date === yesterdayIso ? "border-accent bg-accent/10 text-accent font-medium" : "border-border"}`}
          >
            {t.yesterday}
          </button>
          <input
            type="date"
            max={todayIso}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label={t.sessionDate}
            className="h-7 rounded-md border border-border bg-surface px-2 text-xs text-text"
          />
        </div>
      )}

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

export function ReadingSessionList({ sessions, unit }: { sessions: ReadingSession[]; unit: ProgressUnit }) {
  const [pending, start] = useTransition();
  const t = uz.shelf;
  if (sessions.length === 0) return null;

  return (
    <div className="mt-5 border-t border-border pt-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t.sessionsTitle}</p>
      <ul className="space-y-1.5 text-xs">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-2.5 py-1.5">
            <span>
              <strong className="text-accent">
                +{s.delta} {t.unit[unit]}
              </strong>{" "}
              <span className="text-muted">
                (→ {s.new_value} {t.unit[unit]})
              </span>
            </span>
            <span className="flex items-center gap-2 text-muted">
              <span>{formatDate(s.created_at)}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => void (await deleteReadingSession(s.id)))}
                className="text-muted hover:text-danger"
                title={t.deleteSession}
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
