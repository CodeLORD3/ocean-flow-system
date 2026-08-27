/**
 * Offlinekö för stämpelklockan.
 *
 * Stämplingar som görs utan nät läggs i IndexedDB och syncas när nätet
 * återkommer. occurred_at = lokala stämpeltiden, registered_at sätts av servern
 * vid synk. Identifieraren lagras ALDRIG i klartext: den krypteras med en
 * icke-exporterbar AES-GCM-nyckel som bara finns i enhetens IndexedDB, och
 * posten raderas direkt efter lyckad synk.
 */
import { punch } from "@/lib/clockApi";

const DB_NAME = "mt-clock";
const DB_VERSION = 1;
const QUEUE_STORE = "queue";
const KEY_STORE = "keys";

export interface QueuedPunch {
  id?: number;
  iv: number[];
  cipher: ArrayBuffer;
  action: "in" | "ut" | "rast_start" | "rast_slut";
  occurred_at: string;
  label: string; // helt sifferfri etikett för UI, t.ex. "Stämpling köad 13:12"
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = run(t.objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function deviceKey(): Promise<CryptoKey> {
  const db = await openDb();
  const existing = await tx<CryptoKey | undefined>(db, KEY_STORE, "readonly", (s) => s.get("aes"));
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await tx(db, KEY_STORE, "readwrite", (s) => s.put(key, "aes"));
  return key;
}

export async function enqueuePunch(
  identifier: string,
  action: QueuedPunch["action"],
  occurredAt: string,
) {
  const key = await deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(identifier),
  );
  const db = await openDb();
  await tx(db, QUEUE_STORE, "readwrite", (s) =>
    s.add({
      iv: Array.from(iv),
      cipher,
      action,
      occurred_at: occurredAt,
      label: `Stämpling köad ${new Date(occurredAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`,
    } as QueuedPunch),
  );
}

export async function queuedCount(): Promise<number> {
  const db = await openDb();
  return tx<number>(db, QUEUE_STORE, "readonly", (s) => s.count());
}

export async function queuedItems(): Promise<QueuedPunch[]> {
  const db = await openDb();
  return tx<QueuedPunch[]>(db, QUEUE_STORE, "readonly", (s) => s.getAll() as IDBRequest<QueuedPunch[]>);
}

/** Syncar kön. Returnerar antal lyckade stämplingar. */
export async function syncQueue(): Promise<number> {
  const items = await queuedItems();
  if (!items.length) return 0;
  const key = await deviceKey();
  const db = await openDb();
  let ok = 0;
  for (const item of items) {
    let identifier: string;
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(item.iv) },
        key,
        item.cipher,
      );
      identifier = new TextDecoder().decode(plain);
    } catch {
      await tx(db, QUEUE_STORE, "readwrite", (s) => s.delete(item.id!));
      continue;
    }
    try {
      await punch(identifier, item.action, item.occurred_at);
      ok += 1;
      // rensa direkt efter lyckad synk
      await tx(db, QUEUE_STORE, "readwrite", (s) => s.delete(item.id!));
    } catch {
      break; // fortsätt vid nästa försök
    } finally {
      identifier = "";
    }
  }
  return ok;
}
