import { useCallback, useEffect, useState } from "react";
import { Plus, Github, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { SchemaCard } from "@/components/dashboard/SchemaCard";
import { NewSchemaDialog } from "@/components/dashboard/NewSchemaDialog";
import { RenameDialog } from "@/components/dashboard/RenameDialog";
import { DeleteConfirmDialog } from "@/components/dashboard/DeleteConfirmDialog";
import {
  deleteSchema,
  duplicateSchema,
  getSchema,
  listSchemas,
  putSchema,
  type SchemaSummary,
} from "@/lib/storage/schemas";

export function Dashboard() {
  const [schemas, setSchemas] = useState<SchemaSummary[] | null>(null);
  const [renaming, setRenaming] = useState<SchemaSummary | null>(null);
  const [deleting, setDeleting] = useState<SchemaSummary | null>(null);

  const refresh = useCallback(async () => {
    const list = await listSchemas();
    setSchemas(list);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleRename(name: string) {
    if (!renaming) return;
    const rec = await getSchema(renaming.id);
    if (!rec) return;
    await putSchema({ ...rec, name, updatedAt: Date.now() });
    toast.success("Renamed");
    await refresh();
  }

  async function handleDuplicate(s: SchemaSummary) {
    const dup = await duplicateSchema(s.id);
    if (dup) toast.success("Duplicated");
    await refresh();
  }

  async function handleDelete() {
    if (!deleting) return;
    await deleteSchema(deleting.id);
    toast.success("Deleted");
    await refresh();
  }

  const isEmpty = schemas !== null && schemas.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader>
        <span className="hidden text-sm text-muted-foreground sm:block">
          Your schemas
        </span>
      </AppHeader>

      <main className="relative flex-1 overflow-y-auto bg-radial-fade">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Your schemas
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                DBML in, beautiful diagrams out. Edits are saved to this device.
              </p>
            </div>
            <NewSchemaDialog
              trigger={
                <Button className="gap-1.5">
                  <Plus className="size-4" /> New schema
                </Button>
              }
              onCreated={refresh}
            />
          </div>

          {schemas === null ? (
            <SkeletonGrid />
          ) : isEmpty ? (
            <EmptyState onCreated={refresh} />
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {schemas.map((s, i) => (
                <div
                  key={s.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <SchemaCard
                    schema={s}
                    onRename={(x) => setRenaming(x)}
                    onDuplicate={(x) => handleDuplicate(x)}
                    onDelete={(x) => setDeleting(x)}
                  />
                </div>
              ))}
            </div>
          )}

          <FooterNote />
        </div>
      </main>

      <RenameDialog
        open={!!renaming}
        initialName={renaming?.name ?? ""}
        onClose={() => setRenaming(null)}
        onConfirm={handleRename}
      />
      <DeleteConfirmDialog
        open={!!deleting}
        schemaName={deleting?.name ?? ""}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-44 animate-pulse rounded-lg border border-border bg-card/40"
        />
      ))}
    </div>
  );
}

function EmptyState({ onCreated }: { onCreated: () => void }) {
  return (
    <div className="mt-12 flex flex-col items-center rounded-xl border border-dashed border-border bg-surface/40 px-8 py-16 text-center">
      <div
        className="grid size-14 place-items-center rounded-2xl border border-border bg-gradient-to-br from-primary/15 to-collab/15 text-primary shadow-inner"
        aria-hidden
      >
        <Sparkles className="size-6" />
      </div>
      <h2 className="mt-5 text-lg font-semibold tracking-tight">
        Create your first schema
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Start with the e-commerce sample to see the diagram light up, or begin
        from a blank file.
      </p>
      <div className="mt-5">
        <NewSchemaDialog
          onCreated={onCreated}
          trigger={
            <Button className="gap-1.5">
              <Plus className="size-4" /> New schema
            </Button>
          }
        />
      </div>
    </div>
  );
}

function FooterNote() {
  return (
    <div className="mt-12 flex items-center justify-between border-t border-border pt-6 text-xs text-muted-foreground">
      <span>
        Schemas are stored locally in IndexedDB on this device. Clearing site
        data will remove them.
      </span>
      <a
        href="https://dbml.dbdiagram.io/docs/"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 hover:text-foreground"
      >
        <Github className="size-3.5" /> DBML reference
      </a>
    </div>
  );
}
