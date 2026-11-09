"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { lookupIsbn, type IsbnResult } from "@/app/actions/isbn";
import { setShelfStatus } from "@/app/actions/shelf";
import { BookCover } from "@/components/book/book-cover";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/i18n/uz";
import { isbnVariants } from "@/lib/isbn";
import { STATUSES, type ShelfStatus } from "@/lib/shelf-types";
import { cn } from "@/lib/utils";

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

// Brauzerning oʻz BarcodeDetector'i (Android Chrome) boʻlmasa — zxing-wasm ponyfill (iOS Safari), faqat kerak boʻlganda yuklanadi
async function createDetector(): Promise<Detector> {
  const formats = ["ean_13"];
  const native = (globalThis as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (native && (await native.getSupportedFormats?.())?.includes("ean_13")) return new native({ formats });
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector({ formats: ["ean_13"] }) as unknown as Detector;
}

export function Scanner() {
  const t = uz.scanner;
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<IsbnResult | null>(null);
  const [manual, setManual] = useState("");
  const [pending, start] = useTransition();

  function stopCamera() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  useEffect(() => stopCamera, []);

  function lookup(value: string) {
    start(async () => setResult(await lookupIsbn(value)));
  }

  async function startCamera() {
    setCameraError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      const detector = await createDetector().catch(() => null);
      if (!detector) {
        stopCamera();
        setCameraError(t.unsupported);
        return;
      }
      let busy = false;
      timerRef.current = setInterval(async () => {
        if (busy || video.readyState < 2) return;
        busy = true;
        try {
          const codes = await detector.detect(video);
          const isbn = codes.map((c) => c.rawValue).find((v) => isbnVariants(v));
          if (isbn) {
            stopCamera();
            navigator.vibrate?.(80);
            lookup(isbn);
          }
        } finally {
          busy = false;
        }
      }, 250);
    } catch {
      stopCamera();
      setCameraError(t.noCamera);
    }
  }

  return (
    <div className="space-y-6">
      <div className={cn("relative overflow-hidden rounded-2xl bg-black", !scanning && "hidden")}>
        <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
        {/* shtrix-kod uchun moʻljal ramkasi */}
        <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80" />
        <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white/90">{t.hint}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        {scanning ? (
          <Button variant="secondary" onClick={stopCamera}>
            {t.stop}
          </Button>
        ) : (
          <Button size="lg" onClick={startCamera} disabled={pending}>
            {result ? t.again : t.start}
          </Button>
        )}
      </div>
      {cameraError && <p className="text-sm text-danger">{cameraError}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          stopCamera();
          lookup(manual);
        }}
        className="space-y-2"
      >
        <p className="text-sm text-muted">{t.manual}</p>
        <div className="flex gap-2">
          <Input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" placeholder={t.manualPlaceholder} maxLength={20} name="isbn" />
          <Button type="submit" disabled={pending || !manual.trim()}>
            {pending ? t.searching : t.search}
          </Button>
        </div>
      </form>

      {result?.kind === "invalid" && <p className="text-sm text-danger">{t.invalid}</p>}

      {result?.kind === "not_found" && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p>{ result.external ? t.externalFound : t.notFound(result.isbn) }</p>
          {result.external && (
            <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
              <p className="font-serif font-semibold">{result.external.title}</p>
              <p className="text-muted">{result.external.authors}</p>
              {(result.external.page_count || result.external.year || result.external.publisher) && (
                <p className="mt-1 text-xs text-muted">
                  {[
                    result.external.publisher,
                    result.external.year,
                    result.external.page_count ? `${result.external.page_count} bet` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          )}
          <Link href={`/kitob-qoshish?isbn=${result.isbn}`} className={buttonClasses({ className: "mt-4" })}>
            {t.addIt}
          </Link>
        </div>
      )}

      {result?.kind === "found" && <FoundBook key={result.book.id} result={result} />}
    </div>
  );
}

function FoundBook({ result }: { result: Extract<IsbnResult, { kind: "found" }> }) {
  const t = uz.scanner;
  const { book } = result;
  const [status, setStatus] = useState<ShelfStatus | null>(book.status);
  const [pending, start] = useTransition();

  return (
    <div className="flex gap-4 rounded-2xl border border-border bg-surface p-4">
      <BookCover src={book.cover_url} title={book.title} sizes="96px" className="w-24 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-serif text-lg font-semibold leading-snug">{book.title}</p>
        {book.author_names && <p className="text-sm text-muted">{book.author_names}</p>}
        {book.page_count && <p className="text-xs text-muted">{book.page_count} bet</p>}
        <div className={cn("mt-3 grid grid-cols-2 gap-2", pending && "opacity-60")}>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await setShelfStatus(book.id, s);
                  if (res.ok) setStatus(s);
                })
              }
              className={cn(
                "rounded-lg border px-2 py-1.5 text-sm",
                status === s ? "border-accent bg-accent text-accent-fg" : "border-border hover:bg-surface-2",
              )}
            >
              {uz.status[s]}
            </button>
          ))}
        </div>
        {status && <p className="mt-2 text-xs text-accent">{t.added(uz.status[status])}</p>}
        <Link href={`/kitob/${book.slug}`} className="mt-2 inline-block text-sm text-accent hover:underline">
          {t.open}
        </Link>
      </div>
    </div>
  );
}
