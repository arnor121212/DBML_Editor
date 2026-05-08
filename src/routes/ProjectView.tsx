import { useCallback, useEffect, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { ChevronLeft, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { SchemaCard } from "@/components/dashboard/SchemaCard";
import { NewSchemaDialog } from "@/components/dashboard/NewSchemaDialog";
import { RenameDialog } from "@/components/dashboard/RenameDialog";
import { DeleteConfirmDialog } from "@/components/dashboard/DeleteConfirmDialog";
import { MoveDialog } from "@/components/dashboard/MoveDialog";
import {
  useStorage,
  type ProjectRecord,
  type ProjectSummary,
  type SchemaSummary,
} from "@/lib/storage";
import { formatError } from "@/lib/utils";

export function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const storage = useStorage();
  const [project, setProject] = useState<ProjectRecord | null | undefined>(
    undefined,
  );
  const [schemas, setSchemas] = useState<SchemaSummary[] | null>(null);
  const [allProjects, setAllProjects] = useState<ProjectSummary[]>([]);
  const [renaming, setRenaming] = useState<SchemaSummary | null>(null);
  const [deleting, setDeleting] = useState<SchemaSummary | null>(null);
  const [moving, setMoving] = useState<SchemaSummary | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const [proj, list, projList] = await Promise.all([
        storage.getProject(projectId),
        storage.list(projectId),
        storage.listProjects(),
      ]);
      setProject(proj ?? null);
      setSchemas(list);
      setAllProjects(projList);
    } catch (e) {
      toast.error("Couldn't load project", { description: formatError(e) });
      setSchemas([]);
    }
  }, [storage, projectId]);

  useEffect(() => {
    setSchemas(null);
    setProject(undefined);
    void refresh();
  }, [refresh]);

  async function handleRename(name: string) {
    if (!renaming) return;
    try {
      const rec = await storage.get(renaming.id);
      if (!rec) return;
      await storage.put({ ...rec, name, updatedAt: Date.now() });
      toast.success("Renamed");
      await refresh();
    } catch (e) {
      toast.error("Couldn't rename schema", { description: formatError(e) });
    }
  }

  async function handleDuplicate(s: SchemaSummary) {
    try {
      const dup = await storage.duplicate(s.id);
      if (dup) toast.success("Duplicated");
      await refresh();
    } catch (e) {
      toast.error("Couldn't duplicate schema", { description: formatError(e) });
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await storage.delete(deleting.id);
      toast.success("Deleted");
      await refresh();
    } catch (e) {
      toast.error("Couldn't delete schema", { description: formatError(e) });
    }
  }

  async function handleMove(targetProjectId: string) {
    if (!moving) return;
    try {
      await storage.moveSchema(moving.id, targetProjectId);
      toast.success("Moved");
      await refresh();
    } catch (e) {
      toast.error("Couldn't move schema", { description: formatError(e) });
    }
  }

  // Project not found — bounce back to the dashboard.
  if (project === null) return <Navigate to="/" replace />;

  const isEmpty = schemas !== null && schemas.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          Projects
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="truncate text-sm font-medium">
          {project?.name ?? "…"}
        </span>
      </AppHeader>

      <main className="relative flex-1 overflow-y-auto bg-radial-fade">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {project?.name ?? "Loading…"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {schemas === null
                  ? "Loading schemas…"
                  : schemas.length === 0
                    ? "No schemas in this project yet."
                    : `${schemas.length} schema${schemas.length === 1 ? "" : "s"} in this project.`}
              </p>
            </div>
            {projectId && (
              <NewSchemaDialog
                projectId={projectId}
                trigger={
                  <Button className="gap-1.5">
                    <Plus className="size-4" /> New schema
                  </Button>
                }
                onCreated={refresh}
              />
            )}
          </div>

          {schemas === null ? (
            <SkeletonGrid />
          ) : isEmpty ? (
            <EmptyState projectId={projectId!} onCreated={refresh} />
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
                    onMove={
                      allProjects.length > 1 ? (x) => setMoving(x) : undefined
                    }
                  />
                </div>
              ))}
            </div>
          )}
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
      <MoveDialog
        open={!!moving}
        schema={moving}
        projects={allProjects}
        onClose={() => setMoving(null)}
        onConfirm={handleMove}
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

function EmptyState({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: () => void;
}) {
  return (
    <div className="mt-12 flex flex-col items-center rounded-xl border border-dashed border-border bg-surface/40 px-8 py-16 text-center">
      <div
        className="grid size-14 place-items-center rounded-2xl border border-border bg-gradient-to-br from-primary/15 to-collab/15 text-primary shadow-inner"
        aria-hidden
      >
        <Sparkles className="size-6" />
      </div>
      <h2 className="mt-5 text-lg font-semibold tracking-tight">
        Add your first schema
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Start with the e-commerce sample to see the diagram light up, or begin
        from a blank file.
      </p>
      <div className="mt-5">
        <NewSchemaDialog
          projectId={projectId}
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
