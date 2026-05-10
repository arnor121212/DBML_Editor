import type { ComponentType } from "react";
import { useSyncExternalStore } from "react";

export type CommandScope = "always" | "hasSchema" | "canEdit";

export interface Command {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  shortcut?: string;
  group?: string;
  scope: CommandScope;
  handler: () => void | Promise<void>;
}

type Listener = () => void;

const commands = new Map<string, Command>();
const listeners = new Set<Listener>();
// useSyncExternalStore requires a stable snapshot reference between changes.
let snapshot: Command[] = [];

function notify() {
  snapshot = Array.from(commands.values());
  listeners.forEach((fn) => fn());
}

/**
 * Register one or more commands. Returns a cleanup that removes exactly the
 * entries this call added. Re-registering an existing id replaces the prior
 * entry.
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
