import { useEffect, useRef, useState } from "react";
import { acquireSession, releaseSession, type CollabSession } from "./CollabSession";
import { useSchemaStore } from "@/store/schemaStore";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { debounce } from "@/lib/utils";

/**
 * Lifecycle hook for the per-schema collaboration session. Owns:
 *   - acquiring/releasing the session
 *   - seeding Y.Doc from the store's loaded record (if no peer was found)
 *   - mirroring Y.Text → store.dbml and Y.Map → store.positions
 *
 * Returns null when collab isn't applicable (anonymous viewer, no Supabase,
 * or schema not yet loaded). Components branch on `session` to enable the
 * y-monaco binding etc.
 */
export function useSchemaCollab(): CollabSession | null {
  const schemaId = useSchemaStore((s) => s.schemaId);
  const ownerId = useSchemaStore((s) => s.ownerId);
  const myRole = useSchemaStore((s) => s.myRole);

  const [session, setSession] = useState<CollabSession | null>(null);

  // Collab makes sense for any signed-in collaborator on a cloud schema.
  // Anonymous public-link viewers don't get realtime in v1 — they'd need a
  // sign-in path to broadcast back, and live cursors as a stranger reads
  // someone's doc isn't a feature anyone asked for.
  const enabled =
    isSupabaseConfigured &&
    !!schemaId &&
    ownerId !== null &&
    myRole !== "public-viewer" &&
    myRole !== "public-editor" &&
    !!myRole;

  useEffect(() => {
    if (!enabled || !schemaId) return;
    const s = acquireSession(schemaId);
    setSession(s);
    // Seed the diff guards with the store's *current* values so the initial
    // store→Y.* sync below doesn't treat the existing dbml as a change worth
    // pushing through `setText()` (which would issue a delete+insert and
    // race with peers who already have the right content).
    const cur = useSchemaStore.getState();
    lastTextRef.current = cur.dbml;
    lastPositionsRef.current = JSON.stringify(cur.positions);
    return () => {
      releaseSession(schemaId);
      setSession(null);
    };
  }, [enabled, schemaId]);

  // Seed Y.Doc on the first ready event when no peer was present. The
  // applyExternalDbml/Positions calls below will then take over.
  useEffect(() => {
    if (!session) return;
    return session.onReady(() => {
      if (session.provider.sawPeer) return;
      const s = useSchemaStore.getState();
      session.seed({ dbml: s.dbml, positions: s.positions });
    });
  }, [session]);

  // Mirror Y.Text → store.dbml. Debounce so we don't re-parse on every char
  // even when remote bursts arrive. Skip applying our own local edits (they
  // either originated from y-monaco — which has already updated Monaco — or
  // from setText, which we initiated and don't need to round-trip).
  useEffect(() => {
    if (!session) return;
    const apply = debounce((text: string) => {
      // Only push through if it differs from store.dbml — avoids parser thrash.
      if (useSchemaStore.getState().dbml === text) return;
      useSchemaStore.getState().applyExternalDbml(text);
    }, 220);
    const unsubscribe = session.onTextChange(apply);
    return () => {
      apply.cancel();
      unsubscribe();
    };
  }, [session]);

  // Mirror Y.Map → store.positions, also debounced.
  useEffect(() => {
    if (!session) return;
    const apply = debounce((positions: Record<string, { x: number; y: number }>) => {
      useSchemaStore.getState().applyExternalPositions(positions);
    }, 80);
    const unsubscribe = session.onPositionsChange(apply);
    return () => {
      apply.cancel();
      unsubscribe();
    };
  }, [session]);

  // Wire local store mutations back into Y.* so peers see them. We track the
  // last text/positions the store had to detect changes and translate them
  // into Yjs ops. (Position drags coming from React Flow flow through the
  // store, so this is where they hit the wire.)
  const lastTextRef = useRef<string>("");
  const lastPositionsRef = useRef<string>("{}");
  useEffect(() => {
    if (!session) return;
    return useSchemaStore.subscribe((s) => {
      // Text edits: the y-monaco binding handles Monaco-originated edits
      // directly. The only remaining text-change source is programmatic —
      // e.g. "Load example schema". Detect by mismatch with Y.Text.
      if (s.dbml !== lastTextRef.current) {
        lastTextRef.current = s.dbml;
        if (session.text.toString() !== s.dbml) {
          session.setText(s.dbml);
        }
      }
      // Positions: snapshot for cheap diff detection.
      const serialized = JSON.stringify(s.positions);
      if (serialized !== lastPositionsRef.current) {
        lastPositionsRef.current = serialized;
        // Only push if it actually differs from Y.Map.
        const yPos = session.getPositions();
        if (JSON.stringify(yPos) !== serialized) {
          session.setAllPositions(s.positions);
        }
      }
    });
  }, [session]);

  return session;
}
