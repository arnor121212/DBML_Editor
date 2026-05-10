import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RotateCw,
  type LucideIcon,
} from "lucide-react";
import { useSyncStatus } from "@/lib/sync/useSyncStatus";
import { cn } from "@/lib/utils";

type RenderableStatus = Exclude<ReturnType<typeof useSyncStatus>["phase"], "idle">;

const PILL_BASE =
  "inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px]";

const STATUS: Record<
  RenderableStatus,
  { icon: LucideIcon; iconClass?: string; label: string; classes: string }
> = {
  saving: {
    icon: Loader2,
    iconClass: "animate-spin",
    label: "Saving…",
    classes: "border-border bg-surface-2 text-muted-foreground",
  },
  saved: {
    icon: CheckCircle2,
    label: "Saved",
    classes: "border-border bg-surface-2 text-success",
  },
  "no-project": {
    icon: AlertTriangle,
    label: "Edits not saving",
    classes: "border-warning/40 bg-warning/10 text-warning",
  },
  error: {
    icon: RotateCw,
    label: "Save failed",
    classes:
      "border-destructive/40 bg-destructive/10 text-destructive transition-colors hover:bg-destructive/15",
  },
};

export function StatusPill() {
  const { phase, error, retry } = useSyncStatus();
  if (phase === "idle") return null;

  const config = STATUS[phase];
  const Icon = config.icon;
  const className = cn(PILL_BASE, config.classes);

  if (phase === "error") {
    return (
      <button
        type="button"
        onClick={retry}
        className={className}
        title={error ?? "Retry"}
      >
        <Icon className={cn("size-3", config.iconClass)} />
        {config.label}
      </button>
    );
  }

  return (
    <span className={className} title={phase === "no-project" ? error ?? undefined : undefined}>
      <Icon className={cn("size-3", config.iconClass)} />
      {config.label}
    </span>
  );
}
