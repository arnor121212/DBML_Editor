import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectSummary, SchemaSummary } from "@/lib/storage";

interface Props {
  open: boolean;
  schema: SchemaSummary | null;
  projects: ProjectSummary[];
  onClose: () => void;
  onConfirm: (targetProjectId: string) => void | Promise<void>;
}

export function MoveDialog({
  open,
  schema,
  projects,
  onClose,
  onConfirm,
}: Props) {
  const candidates = projects.filter((p) => p.id !== schema?.projectId);
  const [target, setTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const first = projects.find((p) => p.id !== schema?.projectId);
    setTarget(first?.id ?? "");
  }, [open, projects, schema?.projectId]);

  async function submit() {
    if (!target) return;
    setBusy(true);
    try {
      await onConfirm(target);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const noOptions = candidates.length === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move schema</DialogTitle>
          <DialogDescription>
            {schema && (
              <>
                Move{" "}
                <span className="font-medium text-foreground">
                  {schema.name}
                </span>{" "}
                to a different project.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="move-target">Project</Label>
          {noOptions ? (
            <p className="text-sm text-muted-foreground">
              No other projects yet. Create one first.
            </p>
          ) : (
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="move-target">
                <SelectValue placeholder="Choose a project" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || noOptions || !target}>
            {busy ? "Moving…" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
