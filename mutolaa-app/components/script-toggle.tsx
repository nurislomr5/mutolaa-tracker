"use client";

import { useEffect, useState } from "react";
import { latinToCyrillic } from "@/lib/translit";

// Kirill interfeysi: sahifadagi barcha matn brauzerda lotindan kirillga oʻgiriladi (server va kesh oʻzgarmaydi).
// MutationObserver keyin qoʻshilgan yoki React yangilagan matnlarni ham oʻgiradi.
// Input qiymatlari, kod va [data-no-translit] ichidagi matnlarga tegilmaydi.

const STORAGE_KEY = "script";
const ATTRS = ["placeholder", "title", "aria-label"];
const SKIP = "script,style,noscript,code,pre,textarea,[data-no-translit]";

const written = new WeakMap<Node, string>(); // biz yozgan qiymat — oʻz oʻzgarishlarimizni qayta ishlamaslik uchun
const writtenAttrs = new WeakMap<Element, Record<string, string>>();
let observer: MutationObserver | null = null;

function convertText(node: Text) {
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP)) return;
  const current = node.nodeValue ?? "";
  if (written.get(node) === current) return;
  const next = latinToCyrillic(current);
  written.set(node, next);
  if (next !== current) node.nodeValue = next;
}

function convertAttrs(el: Element) {
  if (el.closest(SKIP)) return;
  const done = writtenAttrs.get(el) ?? {};
  for (const attr of ATTRS) {
    const value = el.getAttribute(attr);
    if (!value || done[attr] === value) continue;
    const next = latinToCyrillic(value);
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

function startCyrillic() {
  if (observer) return;
  document.documentElement.lang = "uz-Cyrl";
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

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "cyrl";
  } catch {
    return false;
  }
}

export function ScriptToggle() {
  const [cyrillic, setCyrillic] = useState(false);

  useEffect(() => {
    if (!readStored()) return;
    // Oqimli (Suspense) kontent gidratsiyasi tugashini kutamiz — aks holda React matn farqini koʻradi
    const run = () => {
      setCyrillic(true);
      startCyrillic();
    };
    if (document.readyState === "complete") {
      const id = setTimeout(run, 300);
      return () => clearTimeout(id);
    }
    const onLoad = () => setTimeout(run, 300);
    window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  function toggle() {
    const next = !cyrillic;
    try {
      localStorage.setItem(STORAGE_KEY, next ? "cyrl" : "latn");
    } catch {
      // xotira yopiq — faqat shu sahifa uchun
    }
    if (next) {
      setCyrillic(true);
      startCyrillic();
    } else {
      // lotinga qaytish: asl matnni React'dan qayta olish eng ishonchli yoʻl
      location.reload();
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      data-no-translit
      aria-label={cyrillic ? "Lotin yozuviga oʻtish" : "Кирилл ёзувига ўтиш"}
      title={cyrillic ? "Lotin yozuviga oʻtish" : "Кирилл ёзувига ўтиш"}
      className="inline-flex h-9 items-center justify-center rounded-lg px-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      {cyrillic ? "Lotin" : "Кирилл"}
    </button>
  );
}
