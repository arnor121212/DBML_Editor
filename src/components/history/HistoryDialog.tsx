import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createSnapshot,
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  pruneAutoSnapshots,
  type SnapshotSummary,
} from "@/lib/snapshots/queries";
import { useSchemaStore } from "@/store/schemaStore";
import { cn, formatError, formatRelativeTime } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function HistoryDialog({ open, onClose }: Props) {
  const schemaId = useSchemaStore((s) => s.schemaId);
  const dbml = useSchemaStore((s) => s.dbml);
  const positions = useSchemaStore((s) => s.positions);
  const isOwner = useSchemaStore((s) => s.isOwner);
  const canEdit = useSchemaStore((s) => s.canEdit);
  const loadRecord = useSchemaStore((s) => s.loadRecord);
  const name = useSchemaStore((s) => s.name);
  const createdAt = useSchemaStore((s) => s.createdAt);
  const projectId = useSchemaStore((s) => s.projectId);

  const [snapshots, setSnapshots] = useState<SnapshotSummary[] | null>(null);
  const [busy, setBusy] = useState<"none" | "save" | "restore" | "delete">("none");
  const [label, setLabel] = useState("");

  const refresh = useCallback(async () => {
    if (!schemaId) return;
    try {
      const list = await listSnapshots(schemaId);
      setSnapshots(list);
    } catch (e) {
      toast.error("Couldn't load history", { description: formatError(e) });
    }
  }, [schemaId]);

  useEffect(() => {
    if (!open) return;
    setLabel("");
    void refresh();
  }, [open, refresh]);

  async function saveSnapshot() {
    if (!schemaId) return;
    setBusy("save");
    try {
      await createSnapshot({
        schemaId,
        dbml,
        positions,
        label: label.trim() || null,
      });
      toast.success(label.trim() ? "Snapshot saved" : "Auto-snapshot saved");
      setLabel("");
      await refresh();
      void pruneAutoSnapshots(schemaId).catch(() => {});
    } catch (e) {
      toast.error("Couldn't save snapshot", { description: formatError(e) });
    } finally {
      setBusy("none");
    }
  }

  async function restore(snap: SnapshotSummary) {
    if (!schemaId) return;
    setBusy("restore");
    try {
      // Auto-snapshot current state first so the user can revert the revert.
      await createSnapshot({
        schemaId,
        dbml,
        positions,
        label: "Auto: before restore",
      });
      const full = await getSnapshot(snap.id);
      if (!full) throw new Error("Snapshot not found");
      // Reuse loadRecord to refresh the editor with the snapshot's content.
      if (!projectId) throw new Error("Project not loaded");
      loadRecord({
        id: schemaId,
        name,
        dbml: full.dbml,
        positions: full.positions,
        projectId,
        createdAt,
        updatedAt: Date.now(),
      });
      toast.success("Restored from snapshot");
      await refresh();
      onClose();
    } catch (e) {
      toast.error("Couldn't restore", { description: formatError(e) });
    } finally {
      setBusy("none");
    }
  }

  async function remove(snap: SnapshotSummary) {
    setBusy("delete");
    try {
      await deleteSnapshot(snap.id);
      await refresh();
    } catch (e) {
      toast.error("Couldn't delete", { description: formatError(e) });
    } finally {
      setBusy("none");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            Version history
          </DialogTitle>
          <DialogDescription>
            Restore a previous version of this schema. The current state is
            auto-snapshotted before any restore.
          </DialogDescription>
        </DialogHeader>

        {canEdit && (
          <div className="flex items-end gap-2 rounded-md border border-border bg-surface-2/50 p-2">
            <div className="flex-1">
              <Input
                placeholder="Label this version (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={busy !== "none"}
                onKeyDown={(e) => e.key === "Enter" && saveSnapshot()}
              />
            </div>
            <Button onClick={saveSnapshot} disabled={busy !== "none"}>
              {busy === "save" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Save className="size-3.5" /> Snapshot
                </>
              )}
            </Button>
          </div>
        )}

        <div className="-mx-6 max-h-[60vh] overflow-y-auto px-6">
          {snapshots === null ? (
            <SkeletonList />
          ) : snapshots.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border bg-surface">
              {snapshots.map((s) => (
                <SnapshotItem
                  key={s.id}
                  snap={s}
                  canRestore={canEdit}
                  canDelete={isOwner}
                  busy={busy !== "none"}
                  onRestore={() => restore(s)}
                  onDelete={() => remove(s)}
                />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SnapshotItem({
  snap,
  canRestore,
  canDelete,
  busy,
  onRestore,
  onDelete,
}: {
  snap: SnapshotSummary;
  canRestore: boolean;
  canDelete: boolean;
  busy: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const isAuto = !snap.label;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
      <Clock
        className={cn(
          "size-4 shrink-0",
          isAuto ? "text-muted-foreground/60" : "text-primary",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">
            {snap.label ?? "Auto-snapshot"}
          </span>
          {isAuto && (
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              auto
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {formatRelativeTime(snap.createdAt)}
        </div>
      </div>
      {canRestore && (
        <Button size="sm" variant="ghost" onClick={onRestore} disabled={busy}>
          <RotateCcw /> Restore
        </Button>
      )}
      {canDelete && (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onDelete}
          disabled={busy}
          aria-label="Delete snapshot"
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-md border border-border bg-card/40"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface-2/30 px-6 py-8 text-center">
      <Clock className="size-6 text-muted-foreground/60" />
      <p className="mt-2 text-sm text-muted-foreground">
        No snapshots yet. Snapshots are saved automatically every few minutes
        of editing — or hit <span className="font-medium">Snapshot</span>{" "}
        above to save one now.
      </p>
    </div>
  );
}
