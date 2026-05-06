import { Sparkles, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSchemaStore } from "@/store/schemaStore";
import { ECOMMERCE_DBML } from "@/lib/dbml/examples";

export function EmptyDiagram() {
  const setDbml = useSchemaStore((s) => s.setDbml);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto flex max-w-md flex-col items-center text-center">
        <Illustration />
        <h3 className="mt-6 text-lg font-semibold tracking-tight">
          Start typing DBML on the left
        </h3>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          Define <span className="font-mono text-foreground/80">Table</span>s,
          add <span className="font-mono text-foreground/80">Ref</span>s
          between columns, and watch the diagram appear here.
        </p>
        <div className="mt-5 flex gap-2">
          <Button onClick={() => setDbml(ECOMMERCE_DBML)} className="gap-1.5">
            <Sparkles className="size-3.5" />
            Load example schema
          </Button>
        </div>
      </div>
    </div>
  );
}

function Illustration() {
  return (
    <div className="relative h-32 w-56">
      <div className="absolute left-2 top-2 h-24 w-32 rotate-[-4deg] rounded-lg border border-border bg-card shadow-xl">
        <div
          className="h-3 rounded-t-lg"
          style={{ background: "oklch(0.7 0.16 245)" }}
        />
        <div className="space-y-1.5 p-2">
          <div className="h-1.5 w-3/4 rounded bg-muted" />
          <div className="h-1.5 w-2/3 rounded bg-muted" />
          <div className="h-1.5 w-1/2 rounded bg-muted" />
          <div className="h-1.5 w-3/5 rounded bg-muted" />
        </div>
      </div>
      <div className="absolute right-0 top-6 h-24 w-32 rotate-[5deg] rounded-lg border border-border bg-card shadow-xl">
        <div
          className="h-3 rounded-t-lg"
          style={{ background: "oklch(0.72 0.18 295)" }}
        />
        <div className="space-y-1.5 p-2">
          <div className="h-1.5 w-2/3 rounded bg-muted" />
          <div className="h-1.5 w-3/4 rounded bg-muted" />
          <div className="h-1.5 w-1/2 rounded bg-muted" />
          <div className="h-1.5 w-2/3 rounded bg-muted" />
        </div>
      </div>
      {/* Connecting line */}
      <svg
        className="absolute inset-0 h-full w-full text-muted-foreground/40"
        viewBox="0 0 224 128"
        fill="none"
      >
        <path
          d="M 90 60 C 110 60 120 75 140 75"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      </svg>
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background shadow-md">
          <Database className="size-5 text-primary" />
        </div>
      </div>
    </div>
  );
}
