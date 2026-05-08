/**
 * Bridge between the schema store's persistence lifecycle and the UI:
 * - exposes the current `SaveStatus` to render the StatusPill
 * - fires deduped toasts on transitions into `error`
 * - exposes a `retry()` that re-runs `persist()` so the pill button works
 *
 * Lives outside the store so the store stays free of React/sonner coupling
 * and so future signals (e.g. collab disconnect) can be folded into the
 * same pill without touching the store.
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSchemaStore, type SaveStatus } from "@/store/schemaStore";

const TOAST_ID = "schemasync-persist-error";

export interface SyncStatus {
  phase: SaveStatus;
  error: string | null;
  retry: () => void;
}

export function useSyncStatus(): SyncStatus {
  const phase = useSchemaStore((s) => s.saveStatus);
  const error = useSchemaStore((s) => s.saveError);
  const persist = useSchemaStore((s) => s.persist);

  // Track the last error message we already toasted so back-to-back failures
  // (every 180ms debounce tick during an outage) collapse to one toast.
  // Sonner's `id` would also dedup, but tracking it ourselves lets us
  // re-toast when the message actually changes (different failure mode).
  const lastToastedRef = useRef<string | null>(null);

  useEffect(() => {
    if (phase === "error" && error) {
      if (lastToastedRef.current !== error) {
        lastToastedRef.current = error;
        toast.error("Couldn't save changes", {
          id: TOAST_ID,
          description: error,
          action: { label: "Retry", onClick: () => void persist() },
        });
      }
      return;
    }
    if (phase === "saved" || phase === "saving" || phase === "idle") {
      // A successful (or in-flight) save clears the dedup so the *next*
      // outage can toast again.
      if (lastToastedRef.current !== null) {
        lastToastedRef.current = null;
        toast.dismiss(TOAST_ID);
      }
    }
    // `no-project` is rendered as an inline banner — no toast.
  }, [phase, error, persist]);

  return { phase, error, retry: () => void persist() };
}
