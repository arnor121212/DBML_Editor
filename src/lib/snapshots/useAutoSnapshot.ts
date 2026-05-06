import { useEffect, useRef } from "react";
import { createSnapshot, pruneAutoSnapshots } from "./queries";
import { useSchemaStore } from "@/store/schemaStore";
import { supabase } from "@/lib/supabase/client";

const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * Auto-snapshot loop. While the editor is mounted, every minute we check:
 * has the user edited since the last snapshot AND has it been ≥5 min since
 * the last snapshot? If yes, write an unlabeled (auto) snapshot.
 *
 * Only runs for cloud schemas (signed-in users). Local-only schemas don't
 * support snapshots in v1.
 */
export function useAutoSnapshot() {
  const lastSnapshotAtRef = useRef<number>(Date.now());
  const schemaId = useSchemaStore((s) => s.schemaId);

  useEffect(() => {
    // Reset the cooldown baseline whenever we navigate to a different schema
    // so the 5-minute window is per-schema, not global.
    lastSnapshotAtRef.current = Date.now();
    if (!schemaId) return;
    const id = window.setInterval(() => {
      void check();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [schemaId]);

  async function check() {
    const s = useSchemaStore.getState();
    if (!supabase) return;
    if (!s.schemaId || !s.canEdit) return;
    // Don't snapshot until the cloud session has a chance to be in place.
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;

    const now = Date.now();
    if (s.lastEditAt <= lastSnapshotAtRef.current) return; // nothing new
    if (now - lastSnapshotAtRef.current < FIVE_MINUTES) return;

    try {
      await createSnapshot({
        schemaId: s.schemaId,
        dbml: s.dbml,
        positions: s.positions,
        label: null,
      });
      lastSnapshotAtRef.current = now;
      void pruneAutoSnapshots(s.schemaId).catch(() => {});
    } catch {
      // Auto-snapshots are best-effort; swallow.
    }
  }
}
