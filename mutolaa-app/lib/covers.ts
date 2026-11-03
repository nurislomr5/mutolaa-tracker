// Foydalanuvchi yuklaydigan muqovalar (Supabase Storage). Client va server uchun umumiy konstantalar —
// server kodi (yuklash/oʻchirish) lib/book-write.ts da.

export const COVER_BUCKET = "covers";
// brauzer rasmni 600px eniga kichraytirib WebP qiladi (~50–150 KB); 1 MB — server action chegarasi ichida
export const COVER_MAX_BYTES = 1024 * 1024;
export const COVER_MAX_WIDTH = 600;
export const COVER_MIME_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;

// Fayl turini kengaytma yoki brauzer aytganiga emas, mazmuniga (bayt imzosiga) qarab aniqlaymiz
export function sniffImageType(bytes: Uint8Array): (typeof COVER_MIME_TYPES)[number] | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

// Bizning bucket'dagi fayl yoʻli (tashqi havola boʻlsa — null)
export function coverPathFromUrl(url: string | null | undefined, supabaseUrl: string) {
  const prefix = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${COVER_BUCKET}/`;
  return url?.startsWith(prefix) ? url.slice(prefix.length) : null;
}
