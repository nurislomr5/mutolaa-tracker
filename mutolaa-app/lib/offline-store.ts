"use client";

import type { OfflineBook, OfflineOp, OfflineSnapshot } from "@/lib/offline";

// Telefondagi oflayn javon: IndexedDB'da javon nusxasi (kv/snapshot) va yuborilmagan amallar navbati (outbox).
// IndexedDB yoʻq yoki bloklangan boʻlsa (maxfiy rejim) — jim ishlamaydi, sayt odatdagidek qoladi.

const DB_NAME = "sahifa-offline";
const SNAPSHOT_KEY = "snapshot";
type StoredOp = OfflineOp & { createdAt: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("kv");
      req.result.createObjectStore("outbox", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(store: "kv" | "outbox", mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Sahifadagi komponentlar uchun holat (useSyncExternalStore): javon nusxasi va navbatdagi amallar soni.
// Har bir oʻzgarishdan keyin IndexedDB'dan qayta oʻqiladi.
export type OfflineState = { loaded: boolean; snapshot: OfflineSnapshot | null; pending: number };
const SERVER_STATE: OfflineState = { loaded: false, snapshot: null, pending: 0 };
let state: OfflineState = SERVER_STATE;
const listeners = new Set<() => void>();

async function reload() {
  try {
    const [snapshot, ops] = offlineSupported() ? await Promise.all([getSnapshot(), listOps()]) : [null, []];
    state = { loaded: true, snapshot, pending: ops.length };
  } catch {
    state = { loaded: true, snapshot: null, pending: 0 };
  }
  listeners.forEach((l) => l());
}

export function subscribeOffline(l: () => void) {
  listeners.add(l);
  if (!state.loaded) void reload();
  return () => void listeners.delete(l);
}
export const getOfflineState = () => state;
export const getServerOfflineState = () => SERVER_STATE;
const emit = () => void reload();

export const getSnapshot = () => run<OfflineSnapshot>("kv", "readonly", (s) => s.get(SNAPSHOT_KEY)).then((v) => v ?? null);

export async function saveSnapshot(snapshot: OfflineSnapshot) {
  // Hali yuborilmagan progress nusxada ham koʻrinsin (aks holda serverdagi eski qiymat ustiga yozilardi)
  const pending = await listOps();
  const books = snapshot.books.map((b): OfflineBook => {
    const last = pending.filter((o) => o.kind === "progress" && o.userBookId === b.id).at(-1);
    return last && last.kind === "progress" ? { ...b, current: last.current, total: last.total, unit: last.unit, format: last.format } : b;
  });
  await run("kv", "readwrite", (s) => s.put({ ...snapshot, books }, SNAPSHOT_KEY));
  emit();
}

export const listOps = () =>
  run<StoredOp[]>("outbox", "readonly", (s) => s.getAll()).then((ops) => (ops ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));

export async function addOp(op: OfflineOp) {
  await run("outbox", "readwrite", (s) => s.put({ ...op, createdAt: new Date().toISOString() }));
  // Progress darhol nusxada ham koʻrinsin
  if (op.kind === "progress") {
    const snap = await getSnapshot();
    if (snap) {
      const books = snap.books.map((b) =>
        b.id === op.userBookId ? { ...b, current: op.current, total: op.total, unit: op.unit, format: op.format, status: op.current >= op.total ? ("read" as const) : ("reading" as const) } : b,
      );
      await run("kv", "readwrite", (s) => s.put({ ...snap, books }, SNAPSHOT_KEY));
    }
  }
  emit();
}

export async function removeOps(ids: string[]) {
  if (!ids.length) return;
  await run("outbox", "readwrite", (s) => {
    for (const id of ids) s.delete(id);
  });
  emit();
}

export async function clearOffline() {
  await run("kv", "readwrite", (s) => s.clear());
  await run("outbox", "readwrite", (s) => s.clear());
  emit();
}

export const offlineSupported = () => typeof indexedDB !== "undefined";

export function newOpId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
