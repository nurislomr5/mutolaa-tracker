"use client";

import { uz } from "@/lib/i18n/uz";

// Joriy rejim <html data-theme> da saqlanadi; ikonkalar CSS orqali almashadi (hydration farqi boʻlmasligi uchun)
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // brauzer xotirasi yopiq boʻlsa, rejim faqat shu sahifa uchun amal qiladi
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={uz.theme.toggle}
      title={uz.theme.toggle}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      {/* Oy — yorugʻ rejimda */}
      <svg className="h-5 w-5 dark:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" strokeLinejoin="round" />
      </svg>
      {/* Quyosh — qorongʻi rejimda */}
      <svg className="hidden h-5 w-5 dark:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}
