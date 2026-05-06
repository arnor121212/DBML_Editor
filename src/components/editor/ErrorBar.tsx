import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useSchemaStore } from "@/store/schemaStore";
import { cn } from "@/lib/utils";

export function ErrorBar() {
  const errors = useSchemaStore((s) => s.errors);
  const ok = errors.length === 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 border-t border-border px-3 py-1.5 text-xs",
        ok
          ? "text-muted-foreground"
          : "text-[oklch(0.78_0.18_25)] bg-[color-mix(in_oklab,oklch(0.62_0.22_25)_8%,transparent)]",
      )}
    >
      {ok ? (
        <>
          <CheckCircle2 className="size-3.5 text-success" />
          <span className="text-muted-foreground">Parsed successfully</span>
        </>
      ) : (
        <>
          <AlertTriangle className="size-3.5" />
          <span className="font-medium">{errors[0].message}</span>
          <span className="ml-auto opacity-70">
            line {errors[0].line}
            {errors.length > 1 && ` · +${errors.length - 1} more`}
          </span>
        </>
      )}
    </div>
  );
}
