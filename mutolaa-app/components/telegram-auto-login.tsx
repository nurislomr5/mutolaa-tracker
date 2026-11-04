"use client";

import { useEffect, useState } from "react";
import { uz } from "@/lib/i18n/uz";
import { safeNext } from "@/lib/safe-next";

type TelegramWindow = Window & { TelegramWebviewProxy?: { postEvent: (type: string, data: string) => void } };

// Mini App'ga signal (telegram-web-app.js'siz): mobil ilovada TelegramWebviewProxy, web/desktop'da parent oynaga postMessage
function postEvent(type: string) {
  const w = window as TelegramWindow;
  if (w.TelegramWebviewProxy) w.TelegramWebviewProxy.postEvent(type, "");
  else if (window.parent !== window) window.parent.postMessage(JSON.stringify({ eventType: type, eventData: "" }), "*");
}

// Bot tugmasidan (web_app) ochilganda Telegram URL fragmentiga #tgWebAppData=… qoʻshadi — shu bilan avtomatik kiramiz
export function TelegramAutoLogin() {
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const initData = new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppData");
    if (!initData) return;
    postEvent("web_app_ready");
    postEvent("web_app_expand");
    // fragmentni tozalaymiz — manzil ulashilganda initData chiqib ketmasin
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);

    fetch("/api/telegram-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData }) })
      .then((res) => res.json())
      .then((data: { ok?: boolean; signedIn?: boolean }) => {
        if (!data.signedIn) return;
        setSigningIn(true);
        // himoyalangan sahifadan /kirish ga yuborilgan boʻlsa — oʻsha sahifaga qaytamiz
        const { pathname, search } = window.location;
        window.location.replace(pathname === "/kirish" ? safeNext(new URLSearchParams(search).get("next")) : pathname + search);
      })
      .catch(() => {});
  }, []);

  if (!signingIn) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 bg-accent py-2 text-center text-sm text-accent-fg">
      {uz.auth.telegramSigningIn}
    </div>
  );
}
