import { useCallback, useEffect, useState } from "react";
import { Github, Sparkles, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { RenameDialog } from "@/components/dashboard/RenameDialog";
import { DeleteConfirmDialog } from "@/components/dashboard/DeleteConfirmDialog";
import { MigrationPrompt } from "@/components/auth/MigrationPrompt";
import {
  makeId,
  useStorage,
  type ProjectRecord,
  type ProjectSummary,
} from "@/lib/storage";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatError } from "@/lib/utils";

export function Dashboard() {
  const storage = useStorage();
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await storage.listProjects();
      setProjects(list);
    } catch (e) {
      toast.error("Couldn't load projects", { description: formatError(e) });
      setProjects([]);
    }
  }, [storage]);

  useEffect(() => {
    setProjects(null);
    void refresh();
  }, [refresh]);

  async function handleCreate(name: string) {
    const now = Date.now();
    const rec: ProjectRecord = {
      id: makeId(),
      name,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await storage.putProject(rec);
      toast.success("Project created");
      await refresh();
    } catch (e) {
      toast.error("Couldn't create project", { description: formatError(e) });
    }
  }

  async function handleRename(name: string) {
    if (!renaming) return;
    try {
      const rec = await storage.getProject(renaming.id);
      if (!rec) return;
      await storage.putProject({ ...rec, name, updatedAt: Date.now() });
      toast.success("Renamed");
      await refresh();
    } catch (e) {
      toast.error("Couldn't rename project", { description: formatError(e) });
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await storage.deleteProject(deleting.id);
      toast.success("Deleted");
      await refresh();
    } catch (e) {
      toast.error("Couldn't delete project", { description: formatError(e) });
    }
  }

  const isEmpty = projects !== null && projects.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader>
        <span className="hidden text-sm text-muted-foreground sm:block">
          Your projects
        </span>
      </AppHeader>

      <main className="relative flex-1 overflow-y-auto bg-radial-fade">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Your projects
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Group related schemas into projects.{" "}
                {user
                  ? "Synced to your account."
                  : "Saved on this device."}
              </p>
            </div>
            <Button
              className="gap-1.5"
              onClick={() => setCreatingOpen(true)}
            >
              <FolderPlus className="size-4" /> New project
            </Button>
          </div>

          {projects === null ? (
            <SkeletonGrid />
          ) : isEmpty ? (
            <EmptyState onNew={() => setCreatingOpen(true)} />
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p, i) => (
                <div
                  key={p.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <ProjectCard
                    project={p}
                    onRename={(x) => setRenaming(x)}
                    onDelete={(x) => setDeleting(x)}
                  />
                </div>
              ))}
            </div>
          )}

          <FooterNote signedIn={!!user} />
        </div>
      </main>

      <RenameDialog
        open={creatingOpen}
        initialName=""
        title="New project"
        label="Project name"
        submitLabel="Create"
        fallback="Untitled project"
        placeholder="e.g. Marketing"
        onClose={() => setCreatingOpen(false)}
        onConfirm={handleCreate}
      />
      <RenameDialog
        open={!!renaming}
        initialName={renaming?.name ?? ""}
        title="Rename project"
        label="Project name"
        fallback="Untitled project"
        onClose={() => setRenaming(null)}
        onConfirm={handleRename}
      />
      <DeleteConfirmDialog
        open={!!deleting}
        schemaName={deleting?.name ?? ""}
        title="Delete this project?"
        trailing={
          deleting && deleting.schemaCount > 0
            ? `holds ${deleting.schemaCount} schema${deleting.schemaCount === 1 ? "" : "s"}. Move or delete them first.`
            : "will be permanently removed. This action can't be undone."
        }
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
      {user && <MigrationPrompt onMigrated={refresh} />}
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

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="mt-12 flex flex-col items-center rounded-xl border border-dashed border-border bg-surface/40 px-8 py-16 text-center">
      <div
        className="grid size-14 place-items-center rounded-2xl border border-border bg-gradient-to-br from-primary/15 to-collab/15 text-primary shadow-inner"
        aria-hidden
      >
        <Sparkles className="size-6" />
      </div>
      <h2 className="mt-5 text-lg font-semibold tracking-tight">
        Create your first project
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        A project is a folder of related schemas. Give it a name like
        “Marketing” or “Analytics” to get started.
      </p>
      <div className="mt-5">
        <Button className="gap-1.5" onClick={onNew}>
          <FolderPlus className="size-4" /> New project
        </Button>
      </div>
    </div>
  );
}

function FooterNote({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="mt-12 flex items-center justify-between border-t border-border pt-6 text-xs text-muted-foreground">
      <span>
        {signedIn
          ? "Schemas are synced to your Supabase account and accessible from any device."
          : "Schemas are stored locally on this device. Sign in to sync them across devices."}
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
