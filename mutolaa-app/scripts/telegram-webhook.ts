/**
 * Telegram bot sozlamalari: webhook manzili (secret bilan), buyruqlar menyusi va Mini App menyu tugmasi.
 *
 *   npm run bot:setup            # webhook -> <NEXT_PUBLIC_APP_URL>/api/bot, buyruqlar menyusi
 *   npm run bot:setup -- --info  # hozirgi webhook holatini koʻrsatish
 *
 * Kerakli env: TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_APP_URL, TELEGRAM_WEBHOOK_SECRET (majburiy).
 * Muhim: secret oʻrnatishdan oldin Vercel'ga ham shu TELEGRAM_WEBHOOK_SECRET qoʻshilgan va deploy qilingan boʻlsin,
 * aks holda bot barcha xabarlarni 401 bilan rad etadi.
 */
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

if (existsSync(".env.local")) Object.assign(process.env, parseEnv(readFileSync(".env.local", "utf8")));

const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();

async function call(method: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function main() {
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN kerak");

  if (process.argv.includes("--info")) {
    const info = await call("getWebhookInfo");
    const { url, pending_update_count, last_error_message, last_error_date } = info.result ?? {};
    console.log({ url, pending_update_count, last_error_message, last_error_date: last_error_date && new Date(last_error_date * 1000) });
    return;
  }

  if (!appUrl.startsWith("https://")) throw new Error("NEXT_PUBLIC_APP_URL https:// bilan boshlanishi kerak");
  // /api/bot secret'siz soʻrovlarni rad etadi — webhook ham faqat secret bilan oʻrnatiladi
  if (secret.length < 16 || !/^[A-Za-z0-9_-]+$/.test(secret)) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET kerak: kamida 16 belgi, faqat A-Z a-z 0-9 _ - (masalan: openssl rand -hex 32)");
  }
  const webhook = await call("setWebhook", {
    url: `${appUrl}/api/bot`,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
    secret_token: secret,
  });
  console.log("setWebhook:", webhook.ok ? "✓ (secret bilan)" : webhook.description);

  const commands = await call("setMyCommands", {
    commands: [
      { command: "login", description: "Saytga kirish havolasi" },
      { command: "status", description: "Hozir oʻqiyotganlarim" },
      { command: "savollar", description: "Ochiq savollar" },
      { command: "qidir", description: "Katalogdan kitob qidirish" },
      { command: "isbn", description: "ISBN raqami boʻyicha kitob (yoki shtrix-kod rasmini yuboring)" },
      { command: "statistika", description: "Yillik natija va streak" },
      { command: "eslatma", description: "Kunlik eslatma vaqti: /eslatma 21" },
      { command: "yordam", description: "Botdan foydalanish" },
    ],
  });
  console.log("setMyCommands:", commands.ok ? "✓" : commands.description);

  // Yozish maydoni yonidagi "📚 Xatchoʻp" tugmasi — saytni Mini App sifatida ochadi (avtomatik kirish bilan)
  const menu = await call("setChatMenuButton", {
    menu_button: { type: "web_app", text: "📚 Xatchoʻp", web_app: { url: `${appUrl}/javonim` } },
  });
  console.log("setChatMenuButton:", menu.ok ? "✓" : menu.description);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
