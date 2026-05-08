import { supabase } from "@/lib/supabase/client";
import {
  countTables,
  makeId,
  type MyRole,
  type ProjectRecord,
  type ProjectSummary,
  type PublicRole,
  type SchemaRecord,
  type SchemaSummary,
  type StorageBackend,
} from "./types";
import type { Positions } from "@/lib/dbml/toFlow";

const TABLE = "schemas";
const PROJECTS_TABLE = "projects";

interface DbRow {
  id: string;
  owner_id: string;
  project_id: string;
  name: string;
  dbml: string;
  positions: Positions;
  public_role: PublicRole;
  created_at: string;
  updated_at: string;
}

interface ProjectDbRow {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: DbRow, myRole: MyRole = null): SchemaRecord {
  return {
    id: row.id,
    name: row.name,
    dbml: row.dbml,
    positions: row.positions ?? {},
    projectId: row.project_id,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    ownerId: row.owner_id,
    publicRole: row.public_role ?? "none",
    myRole,
  };
}

function projectRowToRecord(row: ProjectDbRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    ownerId: row.owner_id,
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

/**
 * On a fresh signed-in account with no projects yet, return one — creating
 * "My schemas" lazily so a brand-new user has somewhere to land. Used by
 * Dashboard listProjects() callers that hit an empty state.
 */
export async function ensureDefaultCloudProject(): Promise<ProjectRecord> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const ownerId = await currentUserId();
  const { data: existing, error: selErr } = await supabase
    .from(PROJECTS_TABLE)
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return projectRowToRecord(existing as ProjectDbRow);
  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .insert({ id: makeId(), owner_id: ownerId, name: "My schemas" })
    .select()
    .single();
  if (error) throw error;
  return projectRowToRecord(data as ProjectDbRow);
}

export const cloudBackend: StorageBackend = {
  async list(projectId?: string): Promise<SchemaSummary[]> {
    if (!supabase) throw new Error("Supabase is not configured.");
    let query = supabase
      .from(TABLE)
      .select("id, name, dbml, project_id, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      projectId: r.project_id as string,
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
      project_id: rec.projectId,
      name: rec.name,
      dbml: rec.dbml,
      positions: rec.positions,
    });
    if (!insErr) return;
    if (insErr.code !== "23505") throw insErr; // not a duplicate-key, real error
    // NOTE: project_id is intentionally NOT in this update. Schema RLS lets
    // editor-collaborators update any column, and we don't want them to be
    // able to retarget the owner's schema into a project they themselves own.
    // Use `moveSchema` (owner-checked) for that explicit operation.
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

  async listProjects(): Promise<ProjectSummary[]> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const ownerId = await currentUserId();
    const [{ data: projects, error: pErr }, { data: counts, error: cErr }] =
      await Promise.all([
        supabase
          .from(PROJECTS_TABLE)
          .select("id, name, created_at, updated_at")
          .eq("owner_id", ownerId)
          .order("updated_at", { ascending: false }),
        supabase
          .from(TABLE)
          .select("project_id")
          .eq("owner_id", ownerId),
      ]);
    if (pErr) throw pErr;
    if (cErr) throw cErr;
    const countMap = new Map<string, number>();
    for (const row of counts ?? []) {
      const pid = (row as { project_id: string }).project_id;
      countMap.set(pid, (countMap.get(pid) ?? 0) + 1);
    }
    return (projects ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      schemaCount: countMap.get(p.id as string) ?? 0,
      createdAt: new Date(p.created_at as string).getTime(),
      updatedAt: new Date(p.updated_at as string).getTime(),
    }));
  },

  async getProject(id: string): Promise<ProjectRecord | undefined> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase
      .from(PROJECTS_TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return projectRowToRecord(data as ProjectDbRow);
  },

  async putProject(rec: ProjectRecord): Promise<void> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const ownerId = await currentUserId();
    const { error: insErr } = await supabase.from(PROJECTS_TABLE).insert({
      id: rec.id,
      owner_id: ownerId,
      name: rec.name,
    });
    if (!insErr) return;
    if (insErr.code !== "23505") throw insErr;
    const { error: updErr } = await supabase
      .from(PROJECTS_TABLE)
      .update({ name: rec.name })
      .eq("id", rec.id);
    if (updErr) throw updErr;
  },

  async deleteProject(id: string): Promise<void> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const ownerId = await currentUserId();
    // Postgres FK is ON DELETE RESTRICT, so a non-empty project will surface
    // as a 23503 foreign-key violation. Translate to a friendlier message.
    // Include `owner_id` in the WHERE so a non-owner attempt that RLS would
    // silently no-op surfaces as a 0-row error rather than apparent success.
    const { data, error } = await supabase
      .from(PROJECTS_TABLE)
      .delete()
      .eq("id", id)
      .eq("owner_id", ownerId)
      .select("id");
    if (error) {
      if (error.code === "23503") {
        throw new Error(
          "Project still has schemas. Move or delete them first.",
        );
      }
      throw error;
    }
    if (!data || data.length === 0) {
      throw new Error("Project not found.");
    }
  },

  async moveSchema(schemaId: string, toProjectId: string): Promise<void> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const ownerId = await currentUserId();
    // Owner-only: filter on owner_id so collaborator-editors can't move
    // someone else's schema into a project they themselves own. The RLS
    // UPDATE policy is permissive (`can_edit_schema`), so this WHERE clause
    // is the actual gate. Postgres FK on project_id ensures the target
    // project exists; RLS on projects ensures the caller owns it.
    const { data, error } = await supabase
      .from(TABLE)
      .update({ project_id: toProjectId })
      .eq("id", schemaId)
      .eq("owner_id", ownerId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("Only the schema owner can move it.");
    }
  },
};

/**
 * Bulk-insert local records into the cloud, generating fresh UUIDs since
 * legacy local IDs aren't UUID-shaped. Records are placed into the user's
 * default project (created on demand). Returns the new records (with the
 * new IDs) so the caller can update any client-side references.
 */
export async function uploadLocalRecords(
  records: SchemaRecord[],
): Promise<SchemaRecord[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (records.length === 0) return [];
  const ownerId = await currentUserId();
  const project = await ensureDefaultCloudProject();
  const rows = records.map((r) => ({
    id: makeId(),
    owner_id: ownerId,
    project_id: project.id,
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
