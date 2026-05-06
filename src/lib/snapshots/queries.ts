import { supabase } from "@/lib/supabase/client";
import type { Positions } from "@/lib/dbml/toFlow";

export interface SnapshotSummary {
  id: string;
  schemaId: string;
  label: string | null;
  createdAt: number;
  createdBy: string | null;
}

export interface SnapshotRecord extends SnapshotSummary {
  dbml: string;
  positions: Positions;
}

const TABLE = "schema_snapshots";

function ensure() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function listSnapshots(
  schemaId: string,
): Promise<SnapshotSummary[]> {
  const sb = ensure();
  const { data, error } = await sb
    .from(TABLE)
    .select("id, schema_id, label, created_at, created_by")
    .eq("schema_id", schemaId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    schemaId: r.schema_id as string,
    label: (r.label as string | null) ?? null,
    createdAt: new Date(r.created_at as string).getTime(),
    createdBy: (r.created_by as string | null) ?? null,
  }));
}

export async function getSnapshot(id: string): Promise<SnapshotRecord | null> {
  const sb = ensure();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    schemaId: data.schema_id as string,
    label: (data.label as string | null) ?? null,
    dbml: data.dbml as string,
    positions: (data.positions as Positions) ?? {},
    createdAt: new Date(data.created_at as string).getTime(),
    createdBy: (data.created_by as string | null) ?? null,
  };
}

export async function createSnapshot(args: {
  schemaId: string;
  dbml: string;
  positions: Positions;
  label?: string | null;
}): Promise<SnapshotSummary> {
  const sb = ensure();
  const { data: userRes } = await sb.auth.getUser();
  const { data, error } = await sb
    .from(TABLE)
    .insert({
      schema_id: args.schemaId,
      dbml: args.dbml,
      positions: args.positions,
      label: args.label ?? null,
      created_by: userRes.user?.id ?? null,
    })
    .select("id, schema_id, label, created_at, created_by")
    .single();
  if (error) throw error;
  return {
    id: data.id as string,
    schemaId: data.schema_id as string,
    label: (data.label as string | null) ?? null,
    createdAt: new Date(data.created_at as string).getTime(),
    createdBy: (data.created_by as string | null) ?? null,
  };
}

/**
 * Keep at most `keep` snapshots per schema, deleting the oldest auto-snapshots
 * (those without a label) once the cap is exceeded. Manual ones are spared.
 */
export async function pruneAutoSnapshots(
  schemaId: string,
  keep = 50,
): Promise<void> {
  const sb = ensure();
  const { data, error } = await sb
    .from(TABLE)
    .select("id, label, created_at")
    .eq("schema_id", schemaId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const auto = (data ?? []).filter((r) => !r.label);
  if (auto.length <= keep) return;
  const toDelete = auto.slice(keep).map((r) => r.id as string);
  if (toDelete.length === 0) return;
  await sb.from(TABLE).delete().in("id", toDelete);
}

export async function deleteSnapshot(id: string): Promise<void> {
  const sb = ensure();
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
