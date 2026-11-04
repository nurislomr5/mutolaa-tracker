import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInitData } from "@/lib/bot/webapp-auth";

const TOKEN = "123456:TEST-token";
const NOW = Date.UTC(2026, 10, 4, 10, 0, 0);

function sign(fields: Record<string, string>, token = TOKEN) {
  const check = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(check).digest("hex") }).toString();
}

const user = JSON.stringify({ id: 42, first_name: "Ali", username: "ali" });
const fresh = String(NOW / 1000 - 60);

describe("Telegram Mini App initData", () => {
  it("toʻgʻri imzo — foydalanuvchi", () => {
    const initData = sign({ auth_date: fresh, query_id: "Q", user, signature: "s" });
    expect(verifyInitData(initData, TOKEN, NOW)).toMatchObject({ id: 42, username: "ali" });
  });

  it("boshqa bot tokeni bilan imzolangan", () => {
    expect(verifyInitData(sign({ auth_date: fresh, user }, "999:other"), TOKEN, NOW)).toBeNull();
  });

  it("maʼlumot oʻzgartirilgan", () => {
    const tampered = sign({ auth_date: fresh, user }).replace("Ali", "Vali");
    expect(verifyInitData(tampered, TOKEN, NOW)).toBeNull();
  });

  it("24 soatdan eski", () => {
    expect(verifyInitData(sign({ auth_date: String(NOW / 1000 - 2 * 86400), user }), TOKEN, NOW)).toBeNull();
  });

  it("hash yoki user yoʻq, buzuq JSON, boʻsh qiymatlar", () => {
    expect(verifyInitData(`auth_date=${fresh}&user=${encodeURIComponent(user)}`, TOKEN, NOW)).toBeNull();
    expect(verifyInitData(sign({ auth_date: fresh }), TOKEN, NOW)).toBeNull();
    expect(verifyInitData(sign({ auth_date: fresh, user: "{buzuq" }), TOKEN, NOW)).toBeNull();
    expect(verifyInitData("", TOKEN, NOW)).toBeNull();
    expect(verifyInitData(sign({ auth_date: fresh, user }), "", NOW)).toBeNull();
  });
});
