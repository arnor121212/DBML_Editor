import { CheckCircle2, Loader2, AlertTriangle, RotateCw } from "lucide-react";
import { useSyncStatus } from "@/lib/sync/useSyncStatus";
import { cn } from "@/lib/utils";

export function StatusPill() {
  const { phase, error, retry } = useSyncStatus();

  if (phase === "idle") return null;

  if (phase === "saving") {
    return (
      <span className={base("text-muted-foreground")}>
        <Loader2 className="size-3 animate-spin" />
        Saving…
      </span>
    );
  }

  if (phase === "saved") {
    return (
      <span className={base("text-success")}>
        <CheckCircle2 className="size-3" />
        Saved
      </span>
    );
  }

  if (phase === "no-project") {
    return (
      <span
        className={base("border-warning/40 bg-warning/10 text-warning")}
        title={error ?? undefined}
      >
        <AlertTriangle className="size-3" />
        Edits not saving
      </span>
    );
  }

  // phase === "error"
  return (
    <button
      type="button"
      onClick={retry}
      className={cn(
        baseClasses("border-destructive/40 bg-destructive/10 text-destructive"),
        "transition-colors hover:bg-destructive/15",
      )}
      title={error ?? "Retry"}
    >
      <RotateCw className="size-3" />
      Save failed
    </button>
  );
}

function baseClasses(extra: string) {
  return cn(
    "inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px]",
    extra,
  );
}

function base(extra: string) {
  return cn(
    "inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-1 text-[11px]",
    extra,
  );
}
