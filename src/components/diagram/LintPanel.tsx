import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  EyeOff,
  Info,
  RotateCcw,
  X,
} from "lucide-react";
import { useSchemaStore } from "@/store/schemaStore";
import { lintSchema, type LintIssue } from "@/lib/dbml/lint";
import { useDismissedLints } from "@/lib/dbml/useDismissedLints";
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
  const schemaId = useSchemaStore((s) => s.schemaId);
  const tableCount = schema.tables.length;
  const [open, setOpen] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);

  const { dismissed, dismiss, restore } = useDismissedLints(schemaId);

  const allIssues = useMemo(() => lintSchema(schema), [schema]);
  const active = allIssues.filter((i) => !dismissed.has(i.id));
  const dismissedIssues = allIssues.filter((i) => dismissed.has(i.id));
  const warnCount = active.filter((i) => i.severity === "warn").length;
  const infoCount = active.length - warnCount;

  if (tableCount === 0) return null;

  function jump(issue: LintIssue) {
    centerOnNode(issue.tableId);
    const line = findTableLine(useSchemaStore.getState().dbml, issue.tableId);
    if (line !== null) {
      if (!hasEditor() && onRequestEditorOpen) onRequestEditorOpen();
      revealLine(line);
    }
  }

  const badgeLabel =
    active.length === 0
      ? "No issues"
      : warnCount > 0
        ? `${warnCount} warning${warnCount === 1 ? "" : "s"}${infoCount > 0 ? ` · ${infoCount} info` : ""}`
        : `${infoCount} info`;

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
              : active.length > 0
                ? "border-border bg-surface-2/90 text-muted-foreground hover:bg-surface-2"
                : "border-border bg-surface-2/90 text-success hover:bg-surface-2",
          )}
          title="Schema lint"
        >
          {warnCount > 0 ? (
            <AlertTriangle className="size-3.5" />
          ) : active.length > 0 ? (
            <Info className="size-3.5" />
          ) : (
            <CheckCircle2 className="size-3.5" />
          )}
          {badgeLabel}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      )}

      {open && (
        <div className="w-80 rounded-md border border-border bg-popover/95 text-popover-foreground shadow-xl backdrop-blur">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px]">
            <span className="font-semibold">Schema lint</span>
            <span className="text-muted-foreground">
              {active.length === 0
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

          {active.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-success">
              <CheckCircle2 className="size-3.5" />
              No active issues.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {active.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  onJump={() => jump(issue)}
                  onIgnore={() => dismiss(issue.id)}
                />
              ))}
            </ul>
          )}

          {dismissedIssues.length > 0 && (
            <div className="border-t border-border">
              <button
                type="button"
                onClick={() => setShowDismissed((v) => !v)}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-surface-2"
              >
                <EyeOff className="size-3" />
                {dismissedIssues.length} ignored
                <ChevronDown
                  className={cn(
                    "ml-auto size-3 opacity-60 transition-transform",
                    showDismissed && "rotate-180",
                  )}
                />
              </button>
              {showDismissed && (
                <ul className="max-h-40 overflow-y-auto pb-1">
                  {dismissedIssues.map((issue) => (
                    <IssueRow
                      key={issue.id}
                      issue={issue}
                      muted
                      onJump={() => jump(issue)}
                      onRestore={() => restore(issue.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IssueRow({
  issue,
  onJump,
  onIgnore,
  onRestore,
  muted,
}: {
  issue: LintIssue;
  onJump: () => void;
  onIgnore?: () => void;
  onRestore?: () => void;
  muted?: boolean;
}) {
  return (
    <li className="group/issue relative">
      <button
        type="button"
        onClick={onJump}
        className={cn(
          "flex w-full items-start gap-2 px-3 py-1.5 pr-8 text-left text-[12px] transition-colors hover:bg-surface-2",
          muted && "text-muted-foreground",
        )}
      >
        {issue.severity === "warn" ? (
          <AlertTriangle
            className={cn(
              "mt-0.5 size-3 shrink-0",
              muted ? "text-muted-foreground/60" : "text-warning",
            )}
          />
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
      {onIgnore && (
        <button
          type="button"
          onClick={onIgnore}
          className="absolute right-2 top-1.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-surface-2 hover:text-foreground group-hover/issue:opacity-100 focus:opacity-100"
          aria-label="Ignore this issue"
          title="Ignore"
        >
          <EyeOff className="size-3" />
        </button>
      )}
      {onRestore && (
        <button
          type="button"
          onClick={onRestore}
          className="absolute right-2 top-1.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-surface-2 hover:text-foreground group-hover/issue:opacity-100 focus:opacity-100"
          aria-label="Restore this issue"
          title="Unignore"
        >
          <RotateCcw className="size-3" />
        </button>
      )}
    </li>
  );
}
