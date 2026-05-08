import { openDB, type IDBPDatabase } from "idb";
import {
  countTables,
  makeId,
  type ProjectRecord,
  type ProjectSummary,
  type SchemaRecord,
  type SchemaSummary,
  type StorageBackend,
} from "./types";

const DB_NAME = "schemasync";
const DB_VERSION = 2;
const STORE = "schemas";
const PROJECTS_STORE = "projects";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
        if (oldVersion < 2) {
          // Create the projects store + projectId index on schemas, then
          // backfill existing rows so every schema has a projectId. All in
          // the upgrade transaction — atomic w.r.t. a partial run.
          const projects = db.createObjectStore(PROJECTS_STORE, {
            keyPath: "id",
          });
          projects.createIndex("updatedAt", "updatedAt");

          const schemas = tx.objectStore(STORE);
          schemas.createIndex("projectId", "projectId");

          const existing = (await schemas.getAll()) as SchemaRecord[];
          if (existing.length > 0) {
            const now = Date.now();
            const defaultProject: ProjectRecord = {
              id: makeId(),
              name: "My schemas",
              createdAt: now,
              updatedAt: now,
            };
            await tx
              .objectStore(PROJECTS_STORE)
              .put(defaultProject);
            for (const rec of existing) {
              await schemas.put({ ...rec, projectId: defaultProject.id });
            }
          }
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Lazy default-project getter. Used when creating the very first schema in
 * a freshly-installed app (no migration ran because there were no records).
 * Returns the existing default if one's there, otherwise creates it.
 */
export async function ensureDefaultProject(): Promise<ProjectRecord> {
  const db = await getDb();
  const all = (await db.getAll(PROJECTS_STORE)) as ProjectRecord[];
  if (all.length > 0) {
    return all.sort((a, b) => a.createdAt - b.createdAt)[0];
  }
  const now = Date.now();
  const rec: ProjectRecord = {
    id: makeId(),
    name: "My schemas",
    createdAt: now,
    updatedAt: now,
  };
  await db.put(PROJECTS_STORE, rec);
  return rec;
}

export const localBackend: StorageBackend = {
  async list(projectId?: string): Promise<SchemaSummary[]> {
    const db = await getDb();
    const all = (await db.getAll(STORE)) as SchemaRecord[];
    return all
      .filter((r) => (projectId ? r.projectId === projectId : true))
      .map((r) => ({
        id: r.id,
        name: r.name,
        projectId: r.projectId,
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

  async listProjects(): Promise<ProjectSummary[]> {
    const db = await getDb();
    const [projects, schemas] = (await Promise.all([
      db.getAll(PROJECTS_STORE),
      db.getAll(STORE),
    ])) as [ProjectRecord[], SchemaRecord[]];
    const counts = new Map<string, number>();
    for (const s of schemas) counts.set(s.projectId, (counts.get(s.projectId) ?? 0) + 1);
    return projects
      .map((p) => ({
        id: p.id,
        name: p.name,
        schemaCount: counts.get(p.id) ?? 0,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async getProject(id: string): Promise<ProjectRecord | undefined> {
    const db = await getDb();
    return db.get(PROJECTS_STORE, id) as Promise<ProjectRecord | undefined>;
  },

  async putProject(rec: ProjectRecord): Promise<void> {
    const db = await getDb();
    await db.put(PROJECTS_STORE, rec);
  },

  async deleteProject(id: string): Promise<void> {
    const db = await getDb();
    const idx = db.transaction(STORE).store.index("projectId");
    const count = await idx.count(IDBKeyRange.only(id));
    if (count > 0) {
      throw new Error(
        `Project still has ${count} schema${count === 1 ? "" : "s"}. Move or delete them first.`,
      );
    }
    await db.delete(PROJECTS_STORE, id);
  },

  async moveSchema(schemaId: string, toProjectId: string): Promise<void> {
    const db = await getDb();
    const rec = (await db.get(STORE, schemaId)) as SchemaRecord | undefined;
    if (!rec) throw new Error("Schema not found.");
    await db.put(STORE, {
      ...rec,
      projectId: toProjectId,
      updatedAt: Date.now(),
    });
  },
};

/** Read every local record. Used only by the local→cloud migration flow. */
export async function listLocalRecords(): Promise<SchemaRecord[]> {
  const db = await getDb();
  return (await db.getAll(STORE)) as SchemaRecord[];
}

/** Drop every local record. Not used currently — migration keeps locals as backup. */
export async function clearLocal(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE);
}
