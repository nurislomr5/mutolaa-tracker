import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("sendAlert", () => {
  const calls: { url: string; body: { chat_id: string; text: string } }[] = [];

  beforeEach(() => {
    vi.resetModules(); // har testda yangi throttle xaritasi
    calls.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response("{}");
    });
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:abc");
    vi.stubEnv("ALERT_TELEGRAM_CHAT_ID", "777");
    vi.stubEnv("MY_TELEGRAM_ID", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("HTML'ni qochirib, admin chatiga yuboradi", async () => {
    const { sendAlert } = await import("@/lib/alert");
    await sendAlert("k1", "Server <xato>", ["GET /kitob/x", "TypeError: a < b"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(calls[0].body.chat_id).toBe("777");
    expect(calls[0].body.text).toBe("⚠️ <b>Server &lt;xato&gt;</b>\nGET /kitob/x\nTypeError: a &lt; b");
  });

  it("bir xil xato 10 daqiqada bir marta", async () => {
    const { sendAlert } = await import("@/lib/alert");
    await sendAlert("same", "A", []);
    await sendAlert("same", "A", []);
    await sendAlert("other", "B", []);
    expect(calls.map((c) => c.body.text)).toEqual(["⚠️ <b>A</b>", "⚠️ <b>B</b>"]);
  });

  it("ALERT_TELEGRAM_CHAT_ID boʻlmasa MY_TELEGRAM_ID ishlatiladi", async () => {
    vi.stubEnv("ALERT_TELEGRAM_CHAT_ID", "");
    vi.stubEnv("MY_TELEGRAM_ID", " 555 ");
    const { sendAlert } = await import("@/lib/alert");
    await sendAlert("k", "A", []);
    expect(calls.map((c) => c.body.chat_id)).toEqual(["555"]);
  });

  it("chat ID sozlanmagan boʻlsa — yubormaydi", async () => {
    vi.stubEnv("ALERT_TELEGRAM_CHAT_ID", "");
    const { sendAlert } = await import("@/lib/alert");
    await sendAlert("k", "A", []);
    expect(calls).toHaveLength(0);
  });

  it("Telegram ishlamasa ham xato otmaydi", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("network");
    });
    const { sendAlert } = await import("@/lib/alert");
    await expect(sendAlert("k", "A", [])).resolves.toBeUndefined();
  });
});
