import type { AppUser, Client, DraftRecord, OrderRecord } from "./types";

const DB_NAME = "tecnoramos-os";
const DB_VERSION = 1;
const STORE = "records";

type StoredRecord<T> = {
  key: string;
  value: T;
  updatedAt: number;
};

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function read<T>(key: string): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(key);
    request.onsuccess = () => resolve((request.result as StoredRecord<T> | undefined)?.value ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function write<T>(key: string, value: T) {
  if (typeof indexedDB === "undefined") return;
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put({ key, value, updatedAt: Date.now() } satisfies StoredRecord<T>);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function remove(key: string) {
  if (typeof indexedDB === "undefined") return;
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

const keyFor = (kind: string, username: string) => `${kind}:${username.toLowerCase()}`;

export const offlineStore = {
  getProfile: () => read<AppUser>("profile"),
  setProfile: (user: AppUser) => write("profile", user),
  clearProfile: () => remove("profile"),

  getClients: () => read<Client[]>("clients"),
  setClients: (clients: Client[]) => write("clients", clients),

  getTechnicians: () => read<AppUser[]>("technicians"),
  setTechnicians: (users: AppUser[]) => write("technicians", users),

  getOrders: (username: string) => read<OrderRecord[]>(keyFor("orders", username)),
  setOrders: (username: string, orders: OrderRecord[]) => write(keyFor("orders", username), orders),

  getDrafts: (username: string) => read<DraftRecord[]>(keyFor("drafts", username)),
  setDrafts: (username: string, drafts: DraftRecord[]) => write(keyFor("drafts", username), drafts),

  getPendingOrders: (username: string) => read<OrderRecord[]>(keyFor("pending", username)),
  setPendingOrders: (username: string, orders: OrderRecord[]) => write(keyFor("pending", username), orders),

  countUnsynced: async (username: string) => {
    const [pending, drafts] = await Promise.all([
      read<OrderRecord[]>(keyFor("pending", username)),
      read<DraftRecord[]>(keyFor("drafts", username)),
    ]);
    return (pending?.length ?? 0) + unsyncedDrafts(drafts ?? []).length;
  },

  // Runs on sign-out. Removes this account's cached copies of server data but
  // never the work that has not reached the server yet: finalized orders
  // waiting to sync and drafts saved offline stay until that user returns.
  clearSyncedAccountData: async (username: string) => {
    const drafts = await read<DraftRecord[]>(keyFor("drafts", username));
    const keptDrafts = unsyncedDrafts(drafts ?? []);
    await Promise.all([
      remove(keyFor("orders", username)),
      keptDrafts.length
        ? write(keyFor("drafts", username), keptDrafts)
        : remove(keyFor("drafts", username)),
    ]);
  },
};

export function unsyncedDrafts(drafts: DraftRecord[]) {
  return drafts.filter((draft) => draft.status === "sync_pending");
}

/** Same 24-hour expiry as the server, so an old phone cache cannot bring a draft back. */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export function isDraftExpired(draft: Pick<DraftRecord, "updatedAt">, now = Date.now()) {
  return now - draft.updatedAt > DRAFT_TTL_MS;
}

export function mergeDrafts(server: DraftRecord[], local: DraftRecord[], now = Date.now()) {
  const merged = new Map<string, DraftRecord>();
  // When online, the server is authoritative. Only locally pending drafts are
  // allowed to supplement it; cached "draft" entries may already have been
  // finalized or discarded by another device.
  const pendingLocal = unsyncedDrafts(local).filter((draft) => !isDraftExpired(draft, now));
  for (const draft of [...server, ...pendingLocal]) {
    const current = merged.get(draft.clientRequestId);
    if (!current || draft.updatedAt > current.updatedAt) {
      merged.set(draft.clientRequestId, draft);
    }
  }
  return [...merged.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}
