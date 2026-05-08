/**
 * Module-scoped registry of named commands. Producers (DiagramToolbar,
 * SchemaEditor) register their handlers on mount; consumers (CommandPalette
 * — and any future surface) read the current list via `useCommands()` and
 * invoke by id via `run()`.
 *
 * Mirrors the editorBus / diagramBus pattern: a single source of truth that
 * lets components on opposite sides of the React tree share behavior
 * without prop-drilling or context. The pubsub piece (`subscribe` +
 * `useSyncExternalStore`) is needed only because the palette's item list
 * has to re-render when registrations change — the toolbar buttons can
 * keep calling `run()` directly.
 */
import type { ComponentType } from "react";
import { useSyncExternalStore } from "react";

export type CommandScope = "always" | "hasSchema" | "canEdit";

export interface Command {
  /** Stable identifier, e.g. `diagram.fit`. Used by `run()` and by the
   *  toolbar buttons that share these handlers. */
  id: string;
  /** Display label in the palette. */
  label: string;
  /** Optional icon (lucide component). */
  icon?: ComponentType<{ className?: string }>;
  /** Display-only shortcut hint, e.g. `Ctrl+K`. */
  shortcut?: string;
  /** Section heading in the palette. */
  group?: string;
  /** Visibility filter applied by the palette. */
  scope: CommandScope;
  /** What clicking the item does. */
  handler: () => void | Promise<void>;
}

type Listener = () => void;

const commands = new Map<string, Command>();
const listeners = new Set<Listener>();
// Cached snapshot — `useSyncExternalStore` requires a stable reference
// across renders when nothing changed, otherwise it tears.
let snapshot: Command[] = [];

function rebuildSnapshot() {
  snapshot = Array.from(commands.values());
}

function notify() {
  rebuildSnapshot();
  listeners.forEach((fn) => fn());
}

/**
 * Register one or more commands. Returns a function that removes exactly
 * the commands this call added — call from a `useEffect` cleanup.
 * Re-registering an existing id replaces the previous entry.
 */
export function register(...cmds: Command[]): () => void {
  for (const c of cmds) commands.set(c.id, c);
  notify();
  return () => {
    for (const c of cmds) {
      const current = commands.get(c.id);
      if (current === c) commands.delete(c.id);
    }
    notify();
  };
}

export function get(id: string): Command | undefined {
  return commands.get(id);
}

export function run(id: string): void {
  const cmd = commands.get(id);
  if (!cmd) return;
  void cmd.handler();
}

function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot(): Command[] {
  return snapshot;
}

/** Subscribe React to the registry. Re-renders when commands are added or
 *  removed. Pass a `scope` filter to limit results to commands that should
 *  show up given the current schema/edit state. */
export function useCommands(scope?: { hasSchema: boolean; canEdit: boolean }): Command[] {
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!scope) return all;
  return all.filter((c) => {
    if (c.scope === "always") return true;
    if (c.scope === "hasSchema") return scope.hasSchema;
    if (c.scope === "canEdit") return scope.canEdit;
    return true;
  });
}
