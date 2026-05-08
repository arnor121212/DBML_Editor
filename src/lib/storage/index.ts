/**
 * Storage facade. Components use `useStorage()` to get the right backend
 * reactively; non-React callers (the Zustand store, debounced tasks) use
 * `getActiveBackend()` which is synchronous — backed by a module-scoped
 * cache that's kept in sync via `onAuthStateChange`. This avoids the race
 * where two `persist()` calls can resolve their backend in different orders
 * around a sign-in event and split-write to local + cloud.
 */
import { useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { localBackend, ensureDefaultProject as ensureDefaultLocalProject } from "./local";
import { cloudBackend, ensureDefaultCloudProject } from "./cloud";
import type { ProjectRecord, StorageBackend } from "./types";

export type {
  SchemaRecord,
  SchemaSummary,
  ProjectRecord,
  ProjectSummary,
  StorageBackend,
  PublicRole,
  CollaboratorRole,
  MyRole,
} from "./types";
export { makeId } from "./types";
export {
  localBackend,
  listLocalRecords,
  clearLocal,
  ensureDefaultProject as ensureDefaultLocalProject,
} from "./local";
export {
  cloudBackend,
  uploadLocalRecords,
  ensureDefaultCloudProject,
} from "./cloud";

/**
 * Cloud-or-local lookup for a single schema. The primary backend (chosen by
 * auth state) is tried first; if it returns nothing, the other backend is
 * tried so anonymous users can still open shared cloud links by URL, and
 * signed-in users can still open old un-migrated local schemas.
 */
import type { SchemaRecord } from "./types";

export async function loadSchema(
  id: string,
): Promise<SchemaRecord | undefined> {
  const primary = activeBackend;
  try {
    const rec = await primary.get(id);
    if (rec) return rec;
  } catch {
    /* fall through */
  }
  const other = primary === localBackend ? cloudBackend : localBackend;
  if (other === cloudBackend && !supabase) return undefined;
  try {
    return await other.get(id);
  } catch {
    return undefined;
  }
}

let activeBackend: StorageBackend = localBackend;

if (supabase) {
  // Best-effort initial pull from in-memory session; the auth-state subscriber
  // below is the source of truth from then on.
  void supabase.auth.getSession().then(({ data }) => {
    activeBackend = data.session ? cloudBackend : localBackend;
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    activeBackend = session ? cloudBackend : localBackend;
  });
}

export function getActiveBackend(): StorageBackend {
  return activeBackend;
}

/**
 * Get-or-create a "My schemas" default project on whichever backend is
 * currently active. Used as the project assignment for first-time schemas
 * created on a fresh account that has zero projects.
 */
export async function ensureDefaultProject(): Promise<ProjectRecord> {
  return activeBackend === cloudBackend
    ? ensureDefaultCloudProject()
    : ensureDefaultLocalProject();
}

/**
 * The backend matching the current auth state, derived once per `user`
 * change. Components should prefer this — it re-renders when auth changes.
 */
export function useStorage(): StorageBackend {
  const { user } = useAuth();
  return useMemo<StorageBackend>(
    () => (user ? cloudBackend : localBackend),
    [user],
  );
}
