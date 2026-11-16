"use client";

import { useEffect, useRef, useState } from "react";
import { uz } from "@/lib/i18n/uz";
import { latinToCyrillic, latinToNewLatin } from "@/lib/translit";
import { cn } from "@/lib/utils";

// Yozuv tanlash: amaldagi lotin (oʻ, gʻ, sh, ch), yangi lotin alifbosi (ö, ğ, ş, ç) yoki kirill.
// Sahifadagi barcha matn brauzerda amaldagi lotindan tanlangan yozuvga oʻgiriladi (server va kesh oʻzgarmaydi).
// MutationObserver keyin qoʻshilgan yoki React yangilagan matnlarni ham oʻgiradi.
// Input qiymatlari, kod va [data-no-translit] ichidagi matnlarga tegilmaydi.

type Script = "latn" | "yangi" | "cyrl";

const STORAGE_KEY = "script";
const ATTRS = ["placeholder", "title", "aria-label"];
const SKIP = "script,style,noscript,code,pre,textarea,[data-no-translit]";
const CONVERTERS: Record<Exclude<Script, "latn">, (text: string) => string> = { yangi: latinToNewLatin, cyrl: latinToCyrillic };
const OPTIONS: { value: Script; sample: string }[] = [
  { value: "latn", sample: "oʻ, gʻ, sh, ch" },
  { value: "yangi", sample: "ö, ğ, ş, ç" },
  { value: "cyrl", sample: "ў, ғ, ш, ч" },
];

const written = new WeakMap<Node, string>(); // biz yozgan qiymat — oʻz oʻzgarishlarimizni qayta ishlamaslik uchun
const writtenAttrs = new WeakMap<Element, Record<string, string>>();
let observer: MutationObserver | null = null;
let convert: (text: string) => string = (text) => text;

function convertText(node: Text) {
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP)) return;
  const current = node.nodeValue ?? "";
  if (written.get(node) === current) return;
  const next = convert(current);
  written.set(node, next);
  if (next !== current) node.nodeValue = next;
}

function convertAttrs(el: Element) {
  if (el.closest(SKIP)) return;
  const done = writtenAttrs.get(el) ?? {};
  for (const attr of ATTRS) {
    const value = el.getAttribute(attr);
    if (!value || done[attr] === value) continue;
    const next = convert(value);
    done[attr] = next;
    if (next !== value) el.setAttribute(attr, next);
  }
  writtenAttrs.set(el, done);
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return convertText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  convertAttrs(root as Element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) convertText(n as Text);
    else convertAttrs(n as Element);
  }
}

function start(script: Exclude<Script, "latn">) {
  if (observer) return;
  convert = CONVERTERS[script];
  if (script === "cyrl") document.documentElement.lang = "uz-Cyrl";
  walk(document.documentElement);
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") convertText(r.target as Text);
      else if (r.type === "attributes") convertAttrs(r.target as Element);
      else r.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
}

function readStored(): Script {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "cyrl" || value === "yangi" ? value : "latn";
  } catch {
    return "latn";
  }
}

export function ScriptToggle() {
  const [script, setScript] = useState<Script>("latn");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = readStored();
    if (stored === "latn") return;
    // Oqimli (Suspense) kontent gidratsiyasi tugashini kutamiz — aks holda React matn farqini koʻradi
    const run = () => {
      setScript(stored);
      start(stored);
    };
    if (document.readyState === "complete") {
      const id = setTimeout(run, 300);
      return () => clearTimeout(id);
    }
    const onLoad = () => setTimeout(run, 300);
    window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next: Script) {
    setOpen(false);
    if (next === script) return;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // xotira yopiq — faqat shu sahifa uchun
    }
    if (script === "latn" && next !== "latn") {
      setScript(next);
      start(next);
    } else {
      // matn allaqachon oʻgirilgan: asl holini React'dan qayta olish eng ishonchli yoʻl
      location.reload();
    }
  }

  const t = uz.script;
  return (
    <div ref={root} className="relative" data-no-translit>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.label}
        title={t.label}
        className="inline-flex h-9 items-center justify-center gap-1 rounded-lg px-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text"
      >
        {t[script]}
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-52 rounded-xl border border-border bg-surface p-1 shadow-lg">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === script}
              onClick={() => choose(o.value)}
              className={cn(
                "flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2",
                o.value === script ? "font-semibold text-accent" : "text-text",
              )}
            >
              {t[o.value]}
              <span className="text-xs font-normal text-muted">{o.sample}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
