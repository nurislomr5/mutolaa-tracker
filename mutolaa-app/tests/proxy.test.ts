// @ts-expect-error — Next ichidagi nusxa (matcher aynan shu kutubxona bilan oʻqiladi), tip fayli yoʻq
import { pathToRegexp as compile } from "next/dist/compiled/path-to-regexp";
import { describe, expect, it } from "vitest";
import { PROTECTED } from "@/lib/protected-paths";
import { LEGACY_HOSTS } from "@/lib/site";
import { config } from "@/proxy";

// proxy.ts dagi matcher qoʻlda yozilgan (build paytida oʻqiladi) — roʻyxatlar bilan mos ekanini shu test ushlab turadi

const pathToRegexp = compile as (source: string) => RegExp;

type Rule = { source: string; has?: { type: string; key?: string; value?: string }[] };
const rules: Rule[] = config.matcher.map((m) => (typeof m === "string" ? { source: m } : m));
const always = rules.filter((r) => !r.has).map((r) => pathToRegexp(r.source));
const byHas = (type: string) => rules.find((r) => r.has?.some((h) => h.type === type))!;
// Next "has" qiymatini shunday tekshiradi: new RegExp(`^${value}$`)
const full = (value: string) => new RegExp(`^${value}$`);

describe("proxy matcher", () => {
  it("himoyalangan sahifalar mehmon uchun ham proxy'dan oʻtadi", () => {
    for (const p of PROTECTED) {
      expect(always.some((re) => re.test(p)), p).toBe(true);
      expect(always.some((re) => re.test(`${p}/ichki`)), `${p}/ichki`).toBe(true);
    }
  });

  it("ochiq sahifalar mehmon uchun proxy'siz ochiladi", () => {
    for (const p of ["/", "/kitoblar", "/kitob/otkan-kunlar", "/muallif/abdulla-qodiriy", "/nashriyotlar", "/ruknlar", "/klublar", "/kirish", "/sitemap.xml"]) {
      expect(always.some((re) => re.test(p)), p).toBe(false);
    }
  });

  it("sessiya cookie'si bor soʻrov proxy'dan oʻtadi, boshqa cookie'lar bilan — yoʻq", () => {
    const rule = byHas("header");
    const cookie = full(rule.has![0].value!);
    expect(rule.has![0].key).toBe("cookie");
    expect(cookie.test("sb-loilpsnetdmnkcnxbgvf-auth-token=base64-eyJ")).toBe(true);
    expect(cookie.test("theme=dark; sb-loilpsnetdmnkcnxbgvf-auth-token.0=base64-eyJ; sb-loilpsnetdmnkcnxbgvf-auth-token.1=abc")).toBe(true);
    expect(cookie.test("theme=dark; sahifa-script=cyrl")).toBe(false);

    const pages = pathToRegexp(rule.source);
    expect(pages.test("/kitob/otkan-kunlar")).toBe(true);
    expect(pages.test("/api/telegram-auth")).toBe(true);
    expect(pages.test("/_next/static/chunks/a.js")).toBe(false);
    expect(pages.test("/api/bot")).toBe(false);
    expect(pages.test("/api/cron/reminders")).toBe(false);
  });

  it("eski domen roʻyxati lib/site.ts bilan bir xil", () => {
    const rule = byHas("host");
    for (const host of LEGACY_HOSTS) expect(full(rule.has![0].value!).test(host), host).toBe(true);
    expect(full(rule.has![0].value!).test("xatchop.uz")).toBe(false);
    // API eski manzilda ham ishlayveradi (bot webhook, cron)
    expect(pathToRegexp(rule.source).test("/api/offline")).toBe(false);
    expect(pathToRegexp(rule.source).test("/kitoblar")).toBe(true);
  });

  it("kirish kodi faqat bosh sahifada ushlanadi", () => {
    const rule = byHas("query");
    expect(rule.has![0].key).toBe("code");
    expect(pathToRegexp(rule.source).test("/")).toBe(true);
    expect(pathToRegexp(rule.source).test("/kitoblar")).toBe(false);
  });
});
