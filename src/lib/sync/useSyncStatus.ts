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
  // Track the last error message we already toasted so a long outage produces
  // one toast (and updates it only when the message actually changes).
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
    if (phase === "saved" && lastToastedRef.current !== null) {
      lastToastedRef.current = null;
      toast.dismiss(TOAST_ID);
    }
  }, [phase, error, persist]);

  return { phase, error, retry: () => void persist() };
}
