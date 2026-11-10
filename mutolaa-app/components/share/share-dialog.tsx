"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";
import { renderShareImage, SHARE_SIZE, type ShareCard, type ShareFormat } from "@/lib/share-image";
import { cn } from "@/lib/utils";

const FORMATS: ShareFormat[] = ["square", "story"];

type Result = { format: ShareFormat; image: { url: string; file: File; canShare: boolean } | null };

// Rasm oynasi: oʻlchamni tanlash (kvadrat / storis), koʻrib chiqish, ulashish yoki yuklab olish.
// Rasm shu qurilmaning oʻzida chiziladi.
function ShareDialog({ card, fileName, shareTitle, onClose }: { card: ShareCard; fileName: string; shareTitle: string; onClose: () => void }) {
  const t = uz.share;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // oyna ochiq turganda sahifa yangilansa ham rasm qayta chizilmasin
  const [snapshot] = useState(card);
  const [format, setFormat] = useState<ShareFormat>("square");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    renderShareImage(snapshot, format)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) return setResult({ format, image: null });
        url = URL.createObjectURL(blob);
        const file = new File([blob], fileName, { type: "image/png" });
        const canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
        setResult({ format, image: { url, file, canShare } });
      })
      .catch(() => {
        if (!cancelled) setResult({ format, image: null });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [snapshot, format, fileName]);

  const ready = result?.format === format ? result : null;
  const image = ready?.image ?? null;
  const { width, height } = SHARE_SIZE[format];

  async function share() {
    if (!image) return;
    try {
      await navigator.share({ files: [image.file], title: shareTitle });
    } catch {
      // foydalanuvchi bekor qildi — oyna ochiq qoladi, yuklab olish tugmasi bor
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // oyna tashqarisiga (xira fonga) bosilsa — yopiladi
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-border bg-surface p-0 text-left text-base font-normal text-text shadow-xl backdrop:bg-black/60"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-serif text-lg font-semibold">
            {t.title}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={t.close}
            className="-mr-1 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
          >
            ✕
          </button>
        </div>

        <div role="group" aria-label={t.formatLabel} className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1 text-sm">
          {FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={f === format}
              onClick={() => setFormat(f)}
              className={cn("rounded-md py-1.5 font-medium transition-colors", f === format ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text")}
            >
              {t[f]}
            </button>
          ))}
        </div>

        <div
          className="mx-auto w-full overflow-hidden rounded-xl bg-surface-2"
          style={{ aspectRatio: `${width} / ${height}`, maxWidth: `calc(52dvh * ${width} / ${height})` }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- qurilmada chizilgan rasm (blob), optimallashtirish kerak emas
            <img src={image.url} alt={t.previewAlt} className="h-full w-full" />
          ) : (
            <p role="status" className={cn("flex h-full items-center justify-center p-4 text-center text-sm", ready ? "text-danger" : "animate-pulse text-muted")}>
              {ready ? t.failed : t.preparing}
            </p>
          )}
        </div>

        {image && (
          <>
            <div className="flex gap-2">
              {image.canShare && (
                <button type="button" onClick={() => void share()} className={buttonClasses({ className: "flex-1" })}>
                  {t.share}
                </button>
              )}
              <a href={image.url} download={fileName} className={buttonClasses({ variant: image.canShare ? "secondary" : "primary", className: "flex-1" })}>
                {t.download}
              </a>
            </div>
            <p className="text-center text-xs text-muted">{t.hint}</p>
          </>
        )}
      </div>
    </dialog>
  );
}

// "Rasm sifatida ulashish" tugmasi: bosilganda oyna ochiladi. Koʻrinishi className orqali beriladi.
export function ShareImageButton({
  card,
  fileName,
  shareTitle,
  className,
  children,
}: {
  card: ShareCard;
  fileName: string;
  shareTitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && <ShareDialog card={card} fileName={fileName} shareTitle={shareTitle} onClose={() => setOpen(false)} />}
    </>
  );
}
