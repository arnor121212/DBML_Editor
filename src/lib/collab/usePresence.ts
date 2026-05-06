import { useEffect, useState } from "react";
import type { CollabSession } from "./CollabSession";
import { useAuth } from "@/lib/auth/AuthProvider";
import { stringToHue } from "@/lib/utils";

export interface PresencePeer {
  clientId: number;
  name: string;
  email?: string;
  avatarUrl?: string;
  color: string;
  cursor: { x: number; y: number } | null;
  isSelf: boolean;
}

interface AwarenessUser {
  name: string;
  email?: string;
  avatarUrl?: string;
  color: string;
}

interface AwarenessState {
  user?: AwarenessUser;
  /** Canvas mouse coords in flow space. Distinct from y-monaco's "cursor"
   *  field, which carries the text caret/selection. */
  mouse?: { x: number; y: number } | null;
}

/**
 * Subscribes to the session's awareness state and returns:
 *   - `peers`: every connected client (incl. self) with their identifying info
 *   - `setCursor(pos | null)`: publish the local user's mouse coords on the canvas
 *
 * The local user's identity is derived from `useAuth()` and pushed into
 * awareness once on mount. Color is deterministic per email.
 */
export function usePresence(session: CollabSession | null): {
  peers: PresencePeer[];
  setCursor: (pos: { x: number; y: number } | null) => void;
} {
  const { user } = useAuth();
  const [peers, setPeers] = useState<PresencePeer[]>([]);

  // Push our identity into awareness whenever it changes.
  useEffect(() => {
    if (!session || !user) return;
    const awareness = session.provider.awareness;
    const name =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      user.email?.split("@")[0] ??
      "Anonymous";
    const seed = user.email ?? user.id;
    const color = `oklch(0.66 0.18 ${stringToHue(seed)})`;
    awareness.setLocalStateField("user", {
      name,
      email: user.email,
      avatarUrl: user.user_metadata?.avatar_url as string | undefined,
      color,
    } satisfies AwarenessUser);
  }, [session, user]);

  // Mirror awareness map → peers array on every change.
  useEffect(() => {
    if (!session) return;
    const awareness = session.provider.awareness;
    const update = () => {
      const next: PresencePeer[] = [];
      const states = awareness.getStates() as Map<number, AwarenessState>;
      for (const [clientId, state] of states.entries()) {
        const u = state.user;
        if (!u) continue;
        next.push({
          clientId,
          name: u.name,
          email: u.email,
          avatarUrl: u.avatarUrl,
          color: u.color,
          cursor: state.mouse ?? null,
          isSelf: clientId === awareness.clientID,
        });
      }
      setPeers(next);
    };
    awareness.on("change", update);
    update();
    return () => awareness.off("change", update);
  }, [session]);

  function setCursor(pos: { x: number; y: number } | null) {
    if (!session) return;
    session.provider.awareness.setLocalStateField("mouse", pos);
  }

  return { peers, setCursor };
}
