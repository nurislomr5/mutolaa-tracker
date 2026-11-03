"use client";

import { useEffect, useRef, useState } from "react";
import { BookCover } from "@/components/book/book-cover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COVER_MAX_WIDTH } from "@/lib/covers";
import { uz } from "@/lib/i18n/uz";

// Rasmni brauzerda 600px eniga kichraytirib WebP (yoki JPEG) qiladi — telefondagi 5 MB surat ~100 KB boʻladi
async function compress(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, COVER_MAX_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  // Eski Safari WebP yarata olmaydi — JPEG'ga qaytamiz
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
  if (!blob) throw new Error("rasm tayyorlanmadi");
  return new File([blob], blob.type === "image/webp" ? "cover.webp" : "cover.jpg", { type: blob.type });
}

export function CoverPicker({ initialUrl, title }: { initialUrl?: string; title?: string }) {
  const t = uz.addBook;
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl ?? "");
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // object URL'ni tozalash (xotira oqib ketmasin)
  useEffect(() => () => void (filePreview && URL.revokeObjectURL(filePreview)), [filePreview]);

  const preview = filePreview ?? (/^https:\/\/\S+$/.test(url) ? url : null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    setError(null);
    if (!file) return;
    setProcessing(true);
    try {
      const small = await compress(file);
      const dt = new DataTransfer();
      dt.items.add(small);
      input.files = dt.files;
      setFilePreview(URL.createObjectURL(small));
      setUrl(""); // yuklangan rasm havoladan ustun
    } catch {
      input.value = "";
      setError(t.coverBadType);
    } finally {
      setProcessing(false);
    }
  }

  function clear() {
    if (fileRef.current) fileRef.current.value = "";
    setFilePreview(null);
    setUrl("");
    setError(null);
  }

  return (
    <fieldset>
      <legend className="block text-sm font-medium">{t.cover}</legend>
      <div className="mt-2 flex gap-4">
        <div className="w-24 shrink-0">
          <BookCover src={preview} title={title || "—"} sizes="96px" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={processing} onClick={() => fileRef.current?.click()}>
              {processing ? t.coverProcessing : preview ? t.coverChange : t.coverUpload}
            </Button>
            {preview && (
              <Button type="button" variant="ghost" size="sm" onClick={clear}>
                {t.coverRemove}
              </Button>
            )}
          </div>
          <input ref={fileRef} type="file" name="cover_file" accept="image/jpeg,image/png,image/webp,image/*" onChange={onFile} className="sr-only" tabIndex={-1} />
          <p className="text-xs text-muted">{t.coverUploadHint}</p>
          {error && <p className="text-xs text-danger">{error}</p>}
          <details className="text-xs" open={Boolean(url) && !filePreview}>
            <summary className="cursor-pointer text-muted">{t.coverOrUrl}</summary>
            <Input
              name="cover_url"
              type="url"
              maxLength={500}
              placeholder="https://"
              value={url}
              onChange={(e) => {
                // havola kiritilsa — tanlangan fayl bekor qilinadi
                if (filePreview) {
                  if (fileRef.current) fileRef.current.value = "";
                  setFilePreview(null);
                }
                setUrl(e.target.value);
              }}
              className="mt-2"
            />
          </details>
        </div>
      </div>
    </fieldset>
  );
}
