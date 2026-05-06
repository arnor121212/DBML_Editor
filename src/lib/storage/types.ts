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
  updatedAt: number;
  createdAt: number;
  tableCount: number;
}

/**
 * The contract every storage backend implements. Both the local IndexedDB
 * impl and the Supabase impl satisfy this so the rest of the app doesn't
 * care which one is in use.
 */
export interface StorageBackend {
  list(): Promise<SchemaSummary[]>;
  get(id: string): Promise<SchemaRecord | undefined>;
  put(rec: SchemaRecord): Promise<void>;
  delete(id: string): Promise<void>;
  duplicate(id: string): Promise<SchemaRecord | undefined>;
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
