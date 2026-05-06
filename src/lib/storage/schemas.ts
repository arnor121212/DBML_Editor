import { openDB, type IDBPDatabase } from "idb";
import type { Positions } from "@/lib/dbml/toFlow";

const DB_NAME = "schemasync";
const DB_VERSION = 1;
const STORE = "schemas";

export interface SchemaRecord {
  id: string;
  name: string;
  dbml: string;
  positions: Positions;
  createdAt: number;
  updatedAt: number;
}

export interface SchemaSummary {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  tableCount: number;
}

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

export async function listSchemas(): Promise<SchemaSummary[]> {
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
}

export async function getSchema(id: string): Promise<SchemaRecord | undefined> {
  const db = await getDb();
  return db.get(STORE, id) as Promise<SchemaRecord | undefined>;
}

export async function putSchema(rec: SchemaRecord): Promise<void> {
  const db = await getDb();
  await db.put(STORE, rec);
}

export async function deleteSchema(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
}

export async function duplicateSchema(id: string): Promise<SchemaRecord | undefined> {
  const src = await getSchema(id);
  if (!src) return undefined;
  const now = Date.now();
  const copy: SchemaRecord = {
    ...src,
    id: makeId(),
    name: `${src.name} (copy)`,
    createdAt: now,
    updatedAt: now,
  };
  await putSchema(copy);
  return copy;
}

export function makeId(): string {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  );
}

function countTables(dbml: string): number {
  return (dbml.match(/^\s*Table\s+/gim) ?? []).length;
}
