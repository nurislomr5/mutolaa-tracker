import { z } from "zod";
import { uz } from "@/lib/i18n/uz";

// Foydalanuvchi kitobini qoʻshish va tahrirlash formalari uchun umumiy validatsiya

const currentYear = new Date().getFullYear();
const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(min).max(max).optional());

export const bookInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  authors: z.string().trim().min(1).max(300),
  formats: z.array(z.enum(["paper", "ebook", "audio"])).min(1),
  page_count: optionalInt(1, 10_000),
  publisher: z.string().trim().max(120).optional(),
  year: optionalInt(1500, currentYear + 1),
  isbn: z
    .string()
    .trim()
    .transform((v) => v.replace(/[^0-9Xx]/g, "").toUpperCase())
    .refine((v) => v === "" || v.length === 10 || v.length === 13, "ISBN 10 yoki 13 xonali boʻlishi kerak")
    .optional(),
  cover_url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), uz.addBook.coverHint)
    .optional(),
  description: z.string().trim().max(3000).optional(),
});

export type BookInput = z.infer<typeof bookInputSchema>;

export function parseAuthors(raw: string) {
  return [...new Set(raw.split(",").map((a) => a.trim()).filter(Boolean))].slice(0, 10);
}

// Formadagi boshlangʻich qiymatlar (tahrirlashda mavjud kitobdan)
export type BookFormValues = {
  title: string;
  authors: string;
  formats: ("paper" | "ebook" | "audio")[];
  page_count: number | null;
  publisher: string;
  year: number | null;
  isbn: string;
  cover_url: string;
  description: string;
};
