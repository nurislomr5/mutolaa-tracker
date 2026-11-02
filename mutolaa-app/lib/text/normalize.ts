// public.uz_normalize() SQL funksiyasining TypeScript nusxasi — ikkalasi bir xil natija berishi shart
// (supabase/migrations/20261102000002_core_schema.sql). "Oʻtkan kunlar" / "Ўткан кунлар" -> "otkan kunlar"

const CYR_WORD_CHAR = "а-яА-ЯёЁўЎқҚғҒҳҲ";
const MULTI: Record<string, string> = { ё: "yo", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ю: "yu", я: "ya" };
const SINGLE_FROM = "абвгдежзийклмнопрстуфхыэўқғҳ";
const SINGLE_TO = "abvgdejziyklmnoprstufxieoqgh";
const DROP = /[ъьʻʼ‘’`´']/g;

export function uzNormalize(input: string | null | undefined): string {
  let s = (input ?? "").toLowerCase();
  // soʻz boshidagi kirill "е" -> "ye" (Ер -> yer)
  s = s.replace(new RegExp(`(^|[^${CYR_WORD_CHAR}])е`, "g"), "$1ye");
  s = s.replace(/[ёцчшщюя]/g, (ch) => MULTI[ch]);
  s = s.replace(/[абвгдежзийклмнопрстуфхыэўқғҳ]/g, (ch) => SINGLE_TO[SINGLE_FROM.indexOf(ch)]);
  s = s.replace(DROP, "");
  return s.replace(/[^a-z0-9]+/g, " ").trim();
}

export function slugify(input: string): string {
  return uzNormalize(input).replace(/ /g, "-");
}
