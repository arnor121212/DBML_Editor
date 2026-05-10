import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, X } from "lucide-react";
import { useSchemaStore } from "@/store/schemaStore";
import { lintSchema, type LintIssue } from "@/lib/dbml/lint";
import { centerOnNode } from "@/lib/commands/diagramBus";
import { hasEditor, revealLine } from "@/lib/editor/editorBus";
import { findTableLine } from "@/lib/dbml/findTableLine";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Props {
  /** Called before the editor reveal if Monaco isn't currently mounted —
   *  same pattern as CommandPalette. */
  onRequestEditorOpen?: () => void;
}

export function LintPanel({ onRequestEditorOpen }: Props) {
  const schema = useSchemaStore((s) => s.schema);
  const tableCount = schema.tables.length;
  const [open, setOpen] = useState(false);

  const issues = useMemo(() => lintSchema(schema), [schema]);
  const warnCount = issues.filter((i) => i.severity === "warn").length;
  const infoCount = issues.length - warnCount;

  if (tableCount === 0) return null;

  function jump(issue: LintIssue) {
    centerOnNode(issue.tableId);
    const line = findTableLine(useSchemaStore.getState().dbml, issue.tableId);
    if (line !== null) {
      if (!hasEditor() && onRequestEditorOpen) onRequestEditorOpen();
      revealLine(line);
    }
  }

  return (
    <div className="pointer-events-auto">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium shadow-lg backdrop-blur transition-colors",
            warnCount > 0
              ? "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15"
              : issues.length > 0
                ? "border-border bg-surface-2/90 text-muted-foreground hover:bg-surface-2"
                : "border-border bg-surface-2/90 text-success hover:bg-surface-2",
          )}
          title="Schema lint"
        >
          {warnCount > 0 ? (
            <AlertTriangle className="size-3.5" />
          ) : issues.length > 0 ? (
            <Info className="size-3.5" />
          ) : (
            <CheckCircle2 className="size-3.5" />
          )}
          {issues.length === 0
            ? "No issues"
            : warnCount > 0
              ? `${warnCount} warning${warnCount === 1 ? "" : "s"}${infoCount > 0 ? ` · ${infoCount} info` : ""}`
              : `${infoCount} info`}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      )}

      {open && (
        <div className="w-80 rounded-md border border-border bg-popover/95 text-popover-foreground shadow-xl backdrop-blur">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px]">
            <span className="font-semibold">Schema lint</span>
            <span className="text-muted-foreground">
              {issues.length === 0
                ? "All clear"
                : `${warnCount} warning${warnCount === 1 ? "" : "s"}, ${infoCount} info`}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              className="ml-auto h-5 w-5"
              onClick={() => setOpen(false)}
              aria-label="Close lint panel"
            >
              <X className="size-3" />
            </Button>
          </div>
          {issues.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-success">
              <CheckCircle2 className="size-3.5" />
              No issues found.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {issues.map((issue) => (
                <li key={issue.id}>
                  <button
                    type="button"
                    onClick={() => jump(issue)}
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-surface-2"
                  >
                    {issue.severity === "warn" ? (
                      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />
                    ) : (
                      <Info className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block break-words">{issue.message}</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        {issue.rule}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
