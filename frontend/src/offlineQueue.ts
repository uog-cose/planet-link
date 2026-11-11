import { api } from "./api";

type QueuedWrite = {
  id: string;
  path: string;
  body: string;
  idempotencyKey: string;
  createdAt: number;
};

const DB_NAME = "youth-quest-offline";
const DB_VERSION = 1;
const STORE = "writes";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FALLBACK_KEY = "yq_offline_queue_v1";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!("indexedDB" in window)) return resolve(null);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return dbPromise;
}

async function fallbackAll(): Promise<QueuedWrite[]> {
  try {
    return JSON.parse(
      localStorage.getItem(FALLBACK_KEY) || "[]",
    ) as QueuedWrite[];
  } catch {
    return [];
  }
}

async function fallbackPut(record: QueuedWrite) {
  const items = (await fallbackAll()).filter((x) => x.id !== record.id);
  localStorage.setItem(FALLBACK_KEY, JSON.stringify([...items, record]));
}

async function fallbackRemove(id: string) {
  const items = (await fallbackAll()).filter((x) => x.id !== id);
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(items));
}

async function put(record: QueuedWrite) {
  const db = await openDb();
  if (!db) {
    await fallbackPut(record);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error || new Error("Unable to save offline work."));
  });
}

async function remove(id: string) {
  const db = await openDb();
  if (!db) {
    await fallbackRemove(id);
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function all(): Promise<QueuedWrite[]> {
  const db = await openDb();
  if (!db) return fallbackAll();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result || []) as QueuedWrite[]);
    request.onerror = () => resolve([]);
  });
}

export async function queueWrite(
  path: string,
  body: unknown,
  idempotencyKey = crypto.randomUUID(),
) {
  const record: QueuedWrite = {
    id: crypto.randomUUID(),
    path,
    body: JSON.stringify(body),
    idempotencyKey,
    createdAt: Date.now(),
  };
  await put(record);
  window.dispatchEvent(new CustomEvent("yq-offline-queue-changed"));
  return record;
}

function shouldDiscard(status?: number) {
  // Authentication failures should remain queued until the player signs back in.
  // Validation/permission/not-found errors cannot be fixed by retrying the same write.
  return !!status && status >= 400 && status < 500 && status !== 401;
}

export async function flushOfflineQueue() {
  if (!navigator.onLine) return { sent: 0, pending: (await all()).length };
  const records = (await all()).sort((a, b) => a.createdAt - b.createdAt);
  let sent = 0;
  let pending = 0;
  for (const record of records) {
    if (Date.now() - record.createdAt > MAX_AGE_MS) {
      await remove(record.id);
      continue;
    }
    try {
      await api(
        record.path,
        {
          method: "POST",
          body: record.body,
        },
        false,
        record.idempotencyKey,
      );
      await remove(record.id);
      sent += 1;
    } catch (error) {
      const status = Number((error as { status?: number })?.status);
      if (shouldDiscard(status)) await remove(record.id);
      else pending += 1;
      // Stop on network/server/auth failures so we do not hammer the API.
      if (!status || status >= 500 || status === 401) break;
    }
  }
  window.dispatchEvent(new CustomEvent("yq-offline-queue-changed"));
  return { sent, pending };
}

export async function queuedCount() {
  return (await all()).length;
}
