import { createHash, timingSafeEqual } from "node:crypto";

// Secret'larni solishtirish: vaqt boʻyicha tahlil (timing attack) qilib boʻlmaydi.
// Avval sha256 — uzunliklar har xil boʻlsa ham timingSafeEqual xato bermaydi va uzunlik sizib chiqmaydi.
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
