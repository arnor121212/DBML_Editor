import { openDB, type IDBPDatabase } from "idb";
import {
  countTables,
  makeId,
  type SchemaRecord,
  type SchemaSummary,
  type StorageBackend,
} from "./types";

const DB_NAME = "schemasync";
const DB_VERSION = 1;
const STORE = "schemas";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
      },
    });
  }
  return dbPromise;
}

export const localBackend: StorageBackend = {
  async list(): Promise<SchemaSummary[]> {
    const db = await getDb();
    const all = (await db.getAll(STORE)) as SchemaRecord[];
    return all
      .map((r) => ({
        id: r.id,
        name: r.name,
        updatedAt: r.updatedAt,
        createdAt: r.createdAt,
        tableCount: countTables(r.dbml),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async get(id: string): Promise<SchemaRecord | undefined> {
    const db = await getDb();
    return db.get(STORE, id) as Promise<SchemaRecord | undefined>;
  },

  async put(rec: SchemaRecord): Promise<void> {
    const db = await getDb();
    await db.put(STORE, rec);
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(STORE, id);
  },

  async duplicate(id: string): Promise<SchemaRecord | undefined> {
    const src = await this.get(id);
    if (!src) return undefined;
    const now = Date.now();
    const copy: SchemaRecord = {
      ...src,
      id: makeId(),
      name: `${src.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    };
    await this.put(copy);
    return copy;
  },
};

/** Read every local record. Used by the local→cloud migration flow. */
export async function listLocalRecords(): Promise<SchemaRecord[]> {
  const db = await getDb();
  return (await db.getAll(STORE)) as SchemaRecord[];
}

/** Drop every local record. Not used currently — migration keeps locals as backup. */
export async function clearLocal(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE);
}
