import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * `null` when env vars aren't configured. The rest of the app branches on
 * this so the dashboard, editor, and IndexedDB persistence keep working
 * without any Supabase config — sign-in is an additive upgrade, not a
 * requirement.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      })
    : null;

export const isSupabaseConfigured = supabase !== null;

if (!isSupabaseConfigured && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info(
    "[SchemaSync] Supabase env vars not set — sign-in is disabled. " +
      "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local to enable.",
  );
}
