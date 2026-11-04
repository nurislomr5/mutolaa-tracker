import { createHmac, timingSafeEqual } from "node:crypto";
import type { TgUser } from "@/lib/bot/login";

// Telegram Mini App initData tekshiruvi (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
// secret = HMAC_SHA256(key="WebAppData", bot_token), hash = HMAC_SHA256(key=secret, "key=value\n…" alifbo tartibida, hash'siz)
const MAX_AGE_SEC = 24 * 60 * 60;

export function verifyInitData(initData: string, botToken: string, now = Date.now()): TgUser | null {
  if (!initData || !botToken || initData.length > 4096) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete("hash");

  const checkString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(checkString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) return null;

  // eski (oʻgʻirlangan) initData bilan kirib boʻlmasin
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || now / 1000 - authDate > MAX_AGE_SEC) return null;

  try {
    const user = JSON.parse(params.get("user") ?? "null") as TgUser | null;
    return user && Number.isSafeInteger(user.id) && user.id > 0 ? user : null;
  } catch {
    return null;
  }
}
