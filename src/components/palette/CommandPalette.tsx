/**
 * Cmd+K palette. Two sections:
 *  - Tables: derived from the schema store; selecting one centers the
 *    diagram on that node (via diagramBus) and reveals its declaration
 *    line in Monaco (via editorBus). If the editor side-panel is closed
 *    the caller passes `onRequestEditorOpen` to open it before reveal.
 *  - Actions: anything registered with `commands/registry`. Grouped by
 *    `command.group`.
 *
 * Keyboard handling lives in `usePaletteHotkey` so the binding can be
 * reused later (e.g. to open the palette from a button).
 */
import { useEffect, useMemo } from "react";
import { Table as TableIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useSchemaStore } from "@/store/schemaStore";
import { useCommands, run, type Command } from "@/lib/commands/registry";
import { centerOnNode } from "@/lib/commands/diagramBus";
import { revealLine, hasEditor } from "@/lib/editor/editorBus";
import { findTableLine } from "@/lib/dbml/findTableLine";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called before the editor reveal if Monaco isn't currently mounted —
   *  lets the parent open the editor side-panel; the bus queues the
   *  reveal and replays it once the editor registers. */
  onRequestEditorOpen?: () => void;
}

export function CommandPalette({ open, onOpenChange, onRequestEditorOpen }: Props) {
  const tables = useSchemaStore((s) => s.schema.tables);
  const dbml = useSchemaStore((s) => s.dbml);
  const schemaId = useSchemaStore((s) => s.schemaId);
  const canEdit = useSchemaStore((s) => s.canEdit);
  const commands = useCommands({ hasSchema: !!schemaId, canEdit });

  // Bucket actions by their `group` for the palette's section headings.
  const groupedActions = useMemo(() => {
    const groups = new Map<string, Command[]>();
    for (const c of commands) {
      const key = c.group ?? "Actions";
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [commands]);

  function jumpToTable(tableId: string) {
    centerOnNode(tableId);
    const line = findTableLine(dbml, tableId);
    if (line !== null) {
      if (!hasEditor() && onRequestEditorOpen) onRequestEditorOpen();
      revealLine(line);
    }
    onOpenChange(false);
  }

  function runAction(id: string) {
    run(id);
    onOpenChange(false);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a table or run an action…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        {tables.length > 0 && (
          <CommandGroup heading="Tables">
            {tables.map((t) => {
              const display =
                t.schema && t.schema !== "public" ? `${t.schema}.${t.name}` : t.name;
              return (
                <CommandItem
                  key={t.id}
                  value={`table ${display} ${t.id}`}
                  onSelect={() => jumpToTable(t.id)}
                >
                  <TableIcon />
                  <span>{display}</span>
                  {t.columns.length > 0 && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {t.columns.length} cols
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
        {groupedActions.length > 0 && tables.length > 0 && <CommandSeparator />}
        {groupedActions.map(([heading, items], i) => (
          <CommandGroup key={heading} heading={heading}>
            {items.map((c) => {
              const Icon = c.icon;
              return (
                <CommandItem
                  key={c.id}
                  value={`${heading} ${c.label}`}
                  onSelect={() => runAction(c.id)}
                >
                  {Icon && <Icon />}
                  <span>{c.label}</span>
                  {c.shortcut && <CommandShortcut>{c.shortcut}</CommandShortcut>}
                </CommandItem>
              );
            })}
            {i < groupedActions.length - 1 && <CommandSeparator />}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

/**
 * Document-level Ctrl/Cmd+K listener that toggles the palette. Skips when
 * focus is inside Monaco or any text input so the editor's own command
 * palette still works. Mirrors the form-control guard in DiagramCanvas.
 *
 * The toggle uses the dispatch-with-updater form so the listener doesn't
 * need to re-bind when `open` changes — keeps the effect deps empty.
 */
export function usePaletteHotkey(
  setOpen: React.Dispatch<React.SetStateAction<boolean>>,
): void {
  useEffect(() => {
    function isFormControl(el: Element | null): boolean {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return true;
      if (el.getAttribute("role") === "textbox") return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== "k" && e.key !== "K") return;
      // The palette's own input is inside the dialog (which lifts above the
      // document) — let cmdk handle Ctrl+K-while-typing if it ever needs to.
      // Outside the dialog, guard against Monaco / regular inputs.
      if (isFormControl(document.activeElement)) return;
      e.preventDefault();
      setOpen((v) => !v);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setOpen]);
}
