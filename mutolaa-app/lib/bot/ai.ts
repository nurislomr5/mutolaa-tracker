import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { FORMATS, NOTE_TYPES, UNITS } from "@/lib/shelf-types";

// Matn yoki ovozli xabarni Gemini orqali tuzilgan amalga aylantirish

const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview"];

const nullable = <T extends z.ZodType>(schema: T) => schema.nullish().transform((v) => v ?? null);

export const intentSchema = z.object({
  action: z.enum(["PROGRESS", "NOTE", "ADD_BOOK", "UNKNOWN"]),
  user_book_id: nullable(z.number().int()),
  new_value: nullable(z.number()),
  new_total: nullable(z.number()),
  format: nullable(z.enum(FORMATS)),
  unit: nullable(z.enum(UNITS)),
  note_type: nullable(z.enum(NOTE_TYPES)),
  reference_point: nullable(z.string()),
  note_content: nullable(z.string()),
  query: nullable(z.string()),
  reply: nullable(z.string()),
});
export type Intent = z.infer<typeof intentSchema>;

export type BookContext = {
  user_book_id: number;
  title: string;
  author: string | null;
  status: string;
  format: string | null;
  unit: string;
  current: number;
  total: number | null;
  audio_minutes: number | null;
  // audio boʻlimlar: nomi va boshlanish daqiqasi
  chapters?: { title: string; start_min: number }[];
};

function instruction(books: BookContext[]) {
  return `Sen "Sahifa" kitob kuzatuvchisining Telegram yordamchisisan. Foydalanuvchi oʻzbek tilida (lotin yoki kirill, ba'zan ruscha) yozadi yoki gapiradi.
Uning javonidagi kitoblar (JSON): ${JSON.stringify(books)}

Xabarni tahlil qilib FAQAT shu JSON obyektni qaytar:
{
  "action": "PROGRESS" | "NOTE" | "ADD_BOOK" | "UNKNOWN",
  "user_book_id": number | null,      // javondagi kitob; nomini taxminiy aytsa ham eng mosini tanla
  "new_value": number | null,         // PROGRESS: yangi joy, kitobning "unit"ida
  "new_total": number | null,         // PROGRESS: jami qiymatni aniq aytsa (masalan "kitob 420 bet ekan")
  "format": "paper" | "ebook" | "audio" | null,   // formatni almashtirsa ("endi qogʻozda oʻqiyapman")
  "unit": "pages" | "minutes" | "percent" | null, // birlik almashsa
  "note_type": "iqtibos" | "savol" | "lugat" | "xulosa" | "taymkod" | null,
  "reference_point": string | null,   // "45-bet" yoki "01:15:00"
  "note_content": string | null,
  "query": string | null,             // ADD_BOOK: katalogdan qidirish uchun kitob nomi/muallif
  "reply": string | null              // UNKNOWN: foydalanuvchiga qisqa oʻzbekcha javob
}

Qoidalar:
- PROGRESS hisoblash: "unit" = minutes boʻlsa "1 soat 20 daqiqaga keldim" -> 80; "yana 30 daqiqa tingladim" -> current + 30. pages: "150-betga keldim" -> 150; "20 bet oʻqidim" -> current + 20. percent: "40 foiz" -> 40.
- Audio kitobda bo'lim aytilsa ("5-qoʻshiqqa keldim", "3-bob tugadi") -> chapters dagi start_min dan foydalan (tugadi desa keyingi bo'limning start_min).
- PDF/telefon beti aytilsa ("PDFda 140/480") va kitob pages da boʻlsa -> round(140/480 * total).
- "tugatdim", "oʻqib boʻldim" -> new_value = total.
- Ustozga/mutaxassisga savol -> NOTE, note_type "savol". Chiroyli jumla/parcha -> "iqtibos". Notanish soʻz maʼnosi -> "lugat". Fikr/xulosa -> "xulosa". Audio vaqt belgisi -> "taymkod".
- Yangi kitob boshlamoqchi yoki qoʻshmoqchi boʻlsa (javonda yoʻq) -> ADD_BOOK.
- Boshqa hollarda UNKNOWN va reply da qisqa yordam.`;
}

export async function parseIntent(
  message: { text: string } | { audio: ArrayBuffer; mimeType: string },
  books: BookContext[],
): Promise<Intent> {
  const ai = new GoogleGenAI({ apiKey: (process.env.GEMINI_API_KEY ?? "").trim() });
  const contents =
    "text" in message
      ? message.text
      : [{ inlineData: { mimeType: message.mimeType, data: Buffer.from(message.audio).toString("base64") } }];

  let lastError: unknown;
  for (const model of MODELS) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents,
        // bitta model osilib qolsa, webhook (maxDuration 60 s) tugamasdan keyingisiga oʻtamiz
        config: { systemInstruction: instruction(books), responseMimeType: "application/json", httpOptions: { timeout: 20_000 } },
      });
      const parsed = intentSchema.safeParse(JSON.parse(res.text || "{}"));
      if (parsed.success) return parsed.data;
      lastError = parsed.error;
    } catch (err) {
      lastError = err;
    }
  }
  console.error("Gemini xatosi:", lastError);
  throw new Error("AI javob bermadi");
}
