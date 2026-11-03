// Oʻzbek lotin -> kirill transliteratsiyasi (interfeysni brauzerda kirillga oʻgirish uchun).
// "Oʻtkan kunlar" -> "Ўткан кунлар", "yoʻq" -> "йўқ", "Shayx" -> "Шайх", "ekran" -> "экран", "maʼlumot" -> "маълумот"

const SINGLE: Record<string, string> = {
  a: "а", b: "б", c: "ц", d: "д", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к", l: "л", m: "м",
  n: "н", o: "о", p: "п", q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "х", y: "й", z: "з",
};
const VOWELS = new Set(["a", "e", "i", "o", "u", "ў"]);
const OKINA = /[ʻ‘'`]/; // oʻ / gʻ belgisi
const TUTUQ = /[ʼ’]/; // tutuq belgisi -> ъ

const isUpper = (ch: string) => ch !== ch.toLowerCase();
const withCase = (cyr: string, upper: boolean) => (upper ? cyr.toUpperCase() : cyr);

function word(w: string): string {
  let out = "";
  for (let i = 0; i < w.length; i++) {
    const ch = w[i];
    const lo = ch.toLowerCase();
    const next = w[i + 1]?.toLowerCase() ?? "";
    const upper = isUpper(ch);
    const prevLetter = out.length ? out[out.length - 1].toLowerCase() : "";

    // oʻ -> ў, gʻ -> ғ (apostrof turidan qatʼi nazar)
    if ((lo === "o" || lo === "g") && OKINA.test(w[i + 1] ?? "")) {
      out += withCase(lo === "o" ? "ў" : "ғ", upper);
      i++;
      continue;
    }
    if (lo === "s" && next === "h") { out += withCase("ш", upper); i++; continue; }
    if (lo === "c" && next === "h") { out += withCase("ч", upper); i++; continue; }
    if (lo === "y" && (next === "o" || next === "u" || next === "a" || next === "e")) {
      // "yoʻq": y + oʻ — bu ё emas, й + ў
      if (next === "o" && OKINA.test(w[i + 2] ?? "")) { out += withCase("й", upper); continue; }
      out += withCase({ o: "ё", u: "ю", a: "я", e: "е" }[next]!, upper);
      i++;
      continue;
    }
    if (lo === "e") {
      // soʻz boshida yoki unlidan keyin — э, aks holda е
      const atStart = out.length === 0;
      const afterVowel = VOWELS.has(prevLetter) || "аеиоуўэ".includes(prevLetter);
      out += withCase(atStart || afterVowel ? "э" : "е", upper);
      continue;
    }
    if (TUTUQ.test(ch)) { out += "ъ"; continue; }
    out += SINGLE[lo] !== undefined ? withCase(SINGLE[lo], upper) : ch;
  }
  return out;
}

// Havola, email va @username boʻlgan boʻlaklar (boʻsh joygacha) oʻgirilmaydi
const SKIP_CHUNK = /^[(«"“]?(https?:\/\/|www\.|@)|\S@\S|\.(com|uz|org|net|app)\b/;
const WORD = /[A-Za-zʻʼ‘’'`]+/g;

export function latinToCyrillic(text: string): string {
  if (!/[A-Za-z]/.test(text)) return text;
  return text.replace(/\S+/g, (chunk) => (SKIP_CHUNK.test(chunk) ? chunk : chunk.replace(WORD, word)));
}
