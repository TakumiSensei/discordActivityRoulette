import { Firestore } from "@google-cloud/firestore";

export type PersistedHistoryEntry = {
  items: string[];
  createdAt: number;
};

export interface HistoryStore {
  load(key: string): Promise<PersistedHistoryEntry[]>;
  save(key: string, entries: PersistedHistoryEntry[]): Promise<void>;
}

class MemoryHistoryStore implements HistoryStore {
  private store = new Map<string, PersistedHistoryEntry[]>();

  async load(key: string): Promise<PersistedHistoryEntry[]> {
    return this.store.get(key) || [];
  }

  async save(key: string, entries: PersistedHistoryEntry[]): Promise<void> {
    this.store.set(key, entries);
  }
}

class FirestoreHistoryStore implements HistoryStore {
  private collection;

  constructor(firestore: Firestore, collectionName = "roulette_history") {
    this.collection = firestore.collection(collectionName);
  }

  async load(key: string): Promise<PersistedHistoryEntry[]> {
    const snapshot = await this.collection.doc(key).get();
    const data = snapshot.data();
    if (!data || !Array.isArray(data.history)) {
      return [];
    }
    return data.history.map((entry: any) => ({
      items: Array.isArray(entry?.items)
        ? entry.items.map((item: any) => String(item)).filter(Boolean)
        : [],
      createdAt: typeof entry?.createdAt === "number" ? entry.createdAt : Date.now(),
    }));
  }

  async save(key: string, entries: PersistedHistoryEntry[]): Promise<void> {
    await this.collection.doc(key).set(
      {
        history: entries,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  }
}

export function createHistoryStore(): HistoryStore {
  if (process.env.HISTORY_STORE === 'memory') return memoryHistoryStore;
  try {
    const firestore = new Firestore();
    console.log("HistoryStore: Using Firestore-backed history store (auto-detected credentials/project).");
    return new FirestoreHistoryStore(firestore);
  } catch (err) {
    console.warn("HistoryStore: Failed to initialize Firestore. Falling back to in-memory store.", err);
    return memoryHistoryStore;
  }
}

// Share development history between room instances for the lifetime of the process.
const memoryHistoryStore = new MemoryHistoryStore();
