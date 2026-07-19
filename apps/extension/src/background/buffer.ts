import type { SessionEvent } from "@watchme/shared";

/**
 * M1-E3-T3: durable event buffer in IndexedDB, keyed by clientEventId.
 *
 * The key choice IS the idempotency guarantee: re-enqueueing the same logical
 * event (service-worker retry, listener double-fire) overwrites one row
 * instead of adding a second, so an event's clientEventId stays stable from
 * first observation to server acknowledgment.
 */

const DB_NAME = "watchme-buffer";
const STORE = "events";

export type BufferedEvent = {
  clientEventId: string;
  sessionId: string;
  enqueuedAt: number;
  event: SessionEvent;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "clientEventId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        transaction.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      }),
  );
}

export async function enqueue(sessionId: string, event: SessionEvent): Promise<void> {
  const record: BufferedEvent = {
    clientEventId: event.clientEventId,
    sessionId,
    enqueuedAt: Date.now(),
    event,
  };
  await tx("readwrite", (store) => store.put(record));
}

export async function bufferedCount(): Promise<number> {
  return tx("readonly", (store) => store.count());
}

/** Oldest-first batch across all sessions. */
export async function takeBatch(limit: number): Promise<BufferedEvent[]> {
  const all = await tx<BufferedEvent[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => a.enqueuedAt - b.enqueuedAt).slice(0, limit);
}

export async function removeEvents(clientEventIds: string[]): Promise<void> {
  if (clientEventIds.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    for (const id of clientEventIds) store.delete(id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}
