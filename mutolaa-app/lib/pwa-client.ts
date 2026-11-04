"use client";

import { useSyncExternalStore } from "react";

// PWA oʻrnatish holati: Chrome/Android "beforeinstallprompt" hodisasini saqlab qoʻyamiz va oʻz tugmamiz orqali chaqiramiz.
// Modul layout'dagi PwaSetup orqali sahifa ochilishi bilan yuklanadi — hodisa oʻtkazib yuborilmasin.

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export type Platform = "unknown" | "standalone" | "telegram" | "ios" | "other";

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

let platform: Platform | null = null;
function detectPlatform(): Platform {
  if (platform) return platform;
  const nav = navigator as Navigator & { standalone?: boolean };
  const w = window as Window & { TelegramWebviewProxy?: unknown };
  if (matchMedia("(display-mode: standalone)").matches || nav.standalone) platform = "standalone";
  // Telegram Mini App: mobil ilovada TelegramWebviewProxy, web.telegram.org'da iframe
  else if (w.TelegramWebviewProxy || window.parent !== window) platform = "telegram";
  else if (/iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1)) platform = "ios";
  else platform = "other";
  return platform;
}

export function usePlatform(): Platform {
  return useSyncExternalStore(subscribe, detectPlatform, () => "unknown");
}

export function useCanPrompt(): boolean {
  return useSyncExternalStore(subscribe, () => deferred !== null, () => false);
}

export async function promptInstall() {
  if (!deferred) return;
  const event = deferred;
  await event.prompt();
  await event.userChoice.catch(() => null);
  deferred = null;
  emit();
}

// "Banner yopildi" belgisi (localStorage) — server'da va xatolikda yashirin deb hisoblaymiz
const DISMISS_KEY = "sahifa:install-banner-dismissed";
let dismissedNow = false;
function readDismissed() {
  if (dismissedNow) return true;
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return true;
  }
}

export function useBannerDismissed(): boolean {
  return useSyncExternalStore(subscribe, readDismissed, () => true);
}

export function dismissBanner() {
  dismissedNow = true;
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // maxfiy rejim — faqat shu sahifa davomida yashiramiz
  }
  emit();
}
