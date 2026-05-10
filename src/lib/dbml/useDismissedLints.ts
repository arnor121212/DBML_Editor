import { useCallback, useEffect, useState } from "react";

/**
 * Per-schema list of dismissed lint issue ids, persisted to localStorage.
 *
 * Stored as a JSON `string[]` (not a Set) so it serializes cleanly. Returned
 * as a `Set` for cheap membership tests in the panel.
 *
 * The key is `schemasync.lint.dismissed.<schemaId>` so dismissals don't leak
 * across schemas. Pass `null` for `schemaId` (e.g. an unloaded schema) and
 * the hook becomes a no-op set.
 */
export function useDismissedLints(schemaId: string | null): {
  dismissed: Set<string>;
  dismiss: (id: string) => void;
  restore: (id: string) => void;
} {
  const storageKey = schemaId
    ? `schemasync.lint.dismissed.${schemaId}`
    : null;
  const [ids, setIds] = useState<string[]>(() => loadFromStorage(storageKey));

  // Reload when the schema changes — IDs from a previous schema mustn't carry
  // over into the new one.
  useEffect(() => {
    setIds(loadFromStorage(storageKey));
  }, [storageKey]);

  const persist = useCallback(
    (next: string[]) => {
      setIds(next);
      if (!storageKey) return;
      try {
        if (next.length === 0) window.localStorage.removeItem(storageKey);
        else window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Quota / private browsing — silently drop.
      }
    },
    [storageKey],
  );

  const dismiss = useCallback(
    (id: string) => {
      if (ids.includes(id)) return;
      persist([...ids, id]);
    },
    [ids, persist],
  );

  const restore = useCallback(
    (id: string) => {
      if (!ids.includes(id)) return;
      persist(ids.filter((x) => x !== id));
    },
    [ids, persist],
  );

  return { dismissed: new Set(ids), dismiss, restore };
}

function loadFromStorage(key: string | null): string[] {
  if (!key || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
