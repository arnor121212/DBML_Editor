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
import { localBackend } from "./local";
import { cloudBackend } from "./cloud";
import type { StorageBackend } from "./types";

export type { SchemaRecord, SchemaSummary, StorageBackend } from "./types";
export { makeId } from "./types";
export { localBackend, listLocalRecords, clearLocal } from "./local";
export { cloudBackend, uploadLocalRecords } from "./cloud";

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
