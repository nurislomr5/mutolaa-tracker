import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalRedirect, siteUrl } from "@/lib/site";

const OLD = "mutolaa-tracker.vercel.app";

afterEach(() => vi.unstubAllEnvs());

describe("siteUrl", () => {
  it("NEXT_PUBLIC_APP_URL https boʻlmasa asosiy domenni qaytaradi", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(siteUrl()).toBe("https://xatchop.uz");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    expect(siteUrl()).toBe("https://xatchop.uz");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.uz/");
    expect(siteUrl()).toBe("https://example.uz");
  });
});

describe("canonicalRedirect", () => {
  it("eski domendagi sahifani asosiy domenga, manzil va soʻrovni saqlab koʻchiradi", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://xatchop.uz");
    expect(canonicalRedirect("GET", OLD, "/kitoblar", "?q=urush&sahifa=2")).toBe("https://xatchop.uz/kitoblar?q=urush&sahifa=2");
    expect(canonicalRedirect("HEAD", OLD.toUpperCase(), "/", "")).toBe("https://xatchop.uz/");
    // email havolasi (token_hash) va PKCE qaytishi ham asosiy domenda yakunlanadi
    expect(canonicalRedirect("GET", OLD, "/auth/confirm", "?token_hash=abc&type=email")).toBe(
      "https://xatchop.uz/auth/confirm?token_hash=abc&type=email",
    );
  });

  it("API, POST va boshqa hostlarga tegmaydi", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://xatchop.uz");
    expect(canonicalRedirect("GET", OLD, "/api/offline", "")).toBeNull();
    expect(canonicalRedirect("POST", OLD, "/kitoblar", "")).toBeNull();
    expect(canonicalRedirect("GET", "xatchop.uz", "/kitoblar", "")).toBeNull();
    expect(canonicalRedirect("GET", "localhost:3000", "/kitoblar", "")).toBeNull();
    expect(canonicalRedirect("GET", "mutolaa-tracker-git-x.vercel.app", "/", "")).toBeNull();
  });

  it("asosiy domen hali eski manzil boʻlsa, hech narsa koʻchirilmaydi", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", `https://${OLD}`);
    expect(canonicalRedirect("GET", OLD, "/kitoblar", "")).toBeNull();
  });

  it("ildizga qaytgan kirish kodini /auth/callback ga uzatadi", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://xatchop.uz");
    expect(canonicalRedirect("GET", "xatchop.uz", "/", "?code=abc")).toBe("/auth/callback?code=abc");
    expect(canonicalRedirect("GET", OLD, "/", "?code=abc")).toBe("https://xatchop.uz/auth/callback?code=abc");
    expect(canonicalRedirect("GET", "xatchop.uz", "/kitoblar", "?code=abc")).toBeNull();
    expect(canonicalRedirect("GET", "xatchop.uz", "/", "?q=code")).toBeNull();
  });
});
