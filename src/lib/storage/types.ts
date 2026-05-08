import type { Positions } from "@/lib/dbml/toFlow";

export type PublicRole = "none" | "viewer" | "editor";
export type CollaboratorRole = "viewer" | "editor" | "owner";
/**
 * The role the current viewer has on a record. `null` for purely-local
 * records (no sharing concept). For cloud records, populated by the cloud
 * backend.
 */
export type MyRole =
  | "owner"
  | "editor"
  | "viewer"
  | "public-editor"
  | "public-viewer"
  | null;

export interface SchemaRecord {
  id: string;
  name: string;
  dbml: string;
  positions: Positions;
  /** Per-table width overrides. Optional — old records and the cloud
   *  backend read as undefined (treated as {}). */
  widths?: Record<string, number>;
  /** Per-edge side preferences. Key: `<srcTableId>.<srcCol>><tgtTableId>.<tgtCol>`.
   *  Value: which side of each table the edge attaches to. When absent the
   *  edge defaults to right→left (the original render direction). */
  edgeSides?: Record<string, { srcSide: "l" | "r"; tgtSide: "l" | "r" }>;
  projectId: string;
  createdAt: number;
  updatedAt: number;
  // Cloud-only fields. Undefined for purely-local records.
  ownerId?: string;
  publicRole?: PublicRole;
  myRole?: MyRole;
}

export interface SchemaSummary {
  id: string;
  name: string;
  projectId: string;
  updatedAt: number;
  createdAt: number;
  tableCount: number;
}

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  // Cloud-only.
  ownerId?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  schemaCount: number;
  updatedAt: number;
  createdAt: number;
}

/**
 * The contract every storage backend implements. Both the local IndexedDB
 * impl and the Supabase impl satisfy this so the rest of the app doesn't
 * care which one is in use.
 */
export interface StorageBackend {
  /** When `projectId` is given, only schemas in that project are returned. */
  list(projectId?: string): Promise<SchemaSummary[]>;
  get(id: string): Promise<SchemaRecord | undefined>;
  put(rec: SchemaRecord): Promise<void>;
  delete(id: string): Promise<void>;
  duplicate(id: string): Promise<SchemaRecord | undefined>;
  // Projects
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<ProjectRecord | undefined>;
  putProject(rec: ProjectRecord): Promise<void>;
  /** Throws if the project still has schemas. */
  deleteProject(id: string): Promise<void>;
  /**
   * Move a schema to a different project. Owner-only at the cloud level —
   * `put` deliberately doesn't pass `project_id` to avoid letting collaborator
   * editors retarget another owner's schema.
   */
  moveSchema(schemaId: string, toProjectId: string): Promise<void>;
}

export function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older runtimes (test environments, etc.).
  return (
    Math.random().toString(36).slice(2, 10) +
    "-" +
    Date.now().toString(36).slice(-6)
  );
}

export function countTables(dbml: string): number {
  return (dbml.match(/^\s*Table\s+/gim) ?? []).length;
}
