import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Code2,
  Pencil,
  Table as TableIcon,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { SplitPane } from "@/components/layout/SplitPane";
import { DBMLEditor } from "@/components/editor/DBMLEditor";
import { ErrorBar } from "@/components/editor/ErrorBar";
import { DiagramCanvas } from "@/components/diagram/DiagramCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSchemaStore } from "@/store/schemaStore";
import { getSchema } from "@/lib/storage/schemas";
import { TooltipProvider } from "@/components/ui/tooltip";

export function SchemaEditor() {
  const { id } = useParams<{ id: string }>();
  const loadRecord = useSchemaStore((s) => s.loadRecord);
  const reset = useSchemaStore((s) => s.reset);
  const loaded = useSchemaStore((s) => s.loaded);
  const errors = useSchemaStore((s) => s.errors);
  const tableCount = useSchemaStore((s) => s.schema.tables.length);
  const refCount = useSchemaStore((s) => s.schema.refs.length);
  const name = useSchemaStore((s) => s.name);
  const setName = useSchemaStore((s) => s.setName);

  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!id) return;
      const rec = await getSchema(id);
      if (cancelled) return;
      if (!rec) {
        setMissing(true);
        return;
      }
      loadRecord(rec);
    }
    void run();
    return () => {
      cancelled = true;
      reset();
    };
  }, [id, loadRecord, reset]);

  if (missing) {
    return (
      <div className="grid h-full place-items-center bg-radial-fade">
        <div className="text-center">
          <h2 className="text-lg font-semibold">Schema not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been deleted.
          </p>
          <Button asChild className="mt-4">
            <Link to="/">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-full min-h-0 flex-col">
        <AppHeader>
          <Button asChild size="icon-sm" variant="ghost" aria-label="Back to dashboard">
            <Link to="/">
              <ArrowLeft />
            </Link>
          </Button>
          <NameEditor value={name} onSave={setName} />
          <span className="ml-2 inline-flex items-center gap-3 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <TableIcon className="size-3" />
              {tableCount}
            </span>
            <span className="inline-flex items-center gap-1">
              <Code2 className="size-3" />
              {refCount} refs
            </span>
            {errors.length === 0 ? (
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2 className="size-3" /> ok
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-destructive">
                {errors.length} {errors.length === 1 ? "issue" : "issues"}
              </span>
            )}
          </span>
        </AppHeader>

        <main className="min-h-0 flex-1">
          <SplitPane
            storageKey="schemasync.split"
            initial={35}
            min={22}
            max={65}
            left={
              <div className="flex h-full min-h-0 flex-col border-r border-border bg-surface">
                <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-[12px] text-muted-foreground">
                  <Code2 className="size-3.5" />
                  <span>schema.dbml</span>
                </div>
                <div className="min-h-0 flex-1">
                  {loaded ? (
                    <DBMLEditor />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Loading…
                    </div>
                  )}
                </div>
                <ErrorBar />
              </div>
            }
            right={
              <div className="h-full bg-background">
                {loaded && <DiagramCanvas />}
              </div>
            }
          />
        </main>
      </div>
    </TooltipProvider>
  );
}

function NameEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const next = draft.trim() || "Untitled schema";
    if (next !== value) onSave(next);
    setEditing(false);
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="h-7 w-56 px-2 text-sm"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group/name inline-flex max-w-xs items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-sm font-medium hover:bg-surface-2"
      title="Rename"
    >
      <span className="truncate">{value}</span>
      <Pencil className="size-3 opacity-0 transition-opacity group-hover/name:opacity-60" />
    </button>
  );
}
