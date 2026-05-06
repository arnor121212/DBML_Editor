import { supabase } from "@/lib/supabase/client";
import {
  countTables,
  makeId,
  type MyRole,
  type PublicRole,
  type SchemaRecord,
  type SchemaSummary,
  type StorageBackend,
} from "./types";
import type { Positions } from "@/lib/dbml/toFlow";

const TABLE = "schemas";

interface DbRow {
  id: string;
  owner_id: string;
  name: string;
  dbml: string;
  positions: Positions;
  public_role: PublicRole;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: DbRow, myRole: MyRole = null): SchemaRecord {
  return {
    id: row.id,
    name: row.name,
    dbml: row.dbml,
    positions: row.positions ?? {},
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    ownerId: row.owner_id,
    publicRole: row.public_role ?? "none",
    myRole,
  };
}

async function deriveMyRole(
  schemaId: string,
  ownerId: string,
  publicRole: PublicRole,
): Promise<MyRole> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;
  if (userId === ownerId) return "owner";
  if (userId) {
    const { data: collab } = await supabase
      .from("schema_collaborators")
      .select("role")
      .eq("schema_id", schemaId)
      .eq("user_id", userId)
      .maybeSingle();
    if (collab?.role === "editor" || collab?.role === "viewer")
      return collab.role;
  }
  // Public link fallback.
  if (publicRole === "editor") return "public-editor";
  if (publicRole === "viewer") return "public-viewer";
  return null;
}

async function currentUserId(): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You're not signed in.");
  return data.user.id;
}

export const cloudBackend: StorageBackend = {
  async list(): Promise<SchemaSummary[]> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, name, dbml, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      tableCount: countTables(r.dbml as string),
      createdAt: new Date(r.created_at as string).getTime(),
      updatedAt: new Date(r.updated_at as string).getTime(),
    }));
  },

  async get(id: string): Promise<SchemaRecord | undefined> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    const row = data as DbRow;
    const myRole = await deriveMyRole(row.id, row.owner_id, row.public_role);
    return rowToRecord(row, myRole);
  },

  async put(rec: SchemaRecord): Promise<void> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const ownerId = await currentUserId();
    // We can't use `.upsert()` here: ON CONFLICT DO UPDATE makes Postgres
    // pre-check the UPDATE policy (`can_edit_schema(id)`) which queries the
    // schemas row. For a brand-new id that row doesn't exist yet, so the
    // function returns false and the entire upsert is rejected with
    // "new row violates row-level security policy", even on the no-conflict
    // path. Splitting into INSERT + UPDATE sidesteps it.
    const { error: insErr } = await supabase.from(TABLE).insert({
      id: rec.id,
      owner_id: ownerId,
      name: rec.name,
      dbml: rec.dbml,
      positions: rec.positions,
    });
    if (!insErr) return;
    if (insErr.code !== "23505") throw insErr; // not a duplicate-key, real error
    const { error: updErr } = await supabase
      .from(TABLE)
      .update({
        name: rec.name,
        dbml: rec.dbml,
        positions: rec.positions,
      })
      .eq("id", rec.id);
    if (updErr) throw updErr;
  },

  async delete(id: string): Promise<void> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const ownerId = await currentUserId();
    // Belt-and-suspenders: include `owner_id` so we can detect the
    // not-yours case via 0-row delete (RLS makes this safe regardless).
    const { data, error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id)
      .eq("owner_id", ownerId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("Schema not found.");
    }
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

/**
 * Bulk-insert local records into the cloud, generating fresh UUIDs since
 * legacy local IDs aren't UUID-shaped. Returns the new records (with the
 * new IDs) so the caller can update any client-side references.
 */
export async function uploadLocalRecords(
  records: SchemaRecord[],
): Promise<SchemaRecord[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (records.length === 0) return [];
  const ownerId = await currentUserId();
  const rows = records.map((r) => ({
    id: makeId(),
    owner_id: ownerId,
    name: r.name,
    dbml: r.dbml,
    positions: r.positions,
    created_at: new Date(r.createdAt).toISOString(),
    updated_at: new Date(r.updatedAt).toISOString(),
  }));
  const { data, error } = await supabase.from(TABLE).insert(rows).select();
  if (error) throw error;
  return (data ?? []).map((row) => rowToRecord(row as DbRow));
}
