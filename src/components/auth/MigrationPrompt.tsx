import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listLocalRecords, uploadLocalRecords } from "@/lib/storage";
import { formatError } from "@/lib/utils";

const FLAG_PREFIX = "schemasync.migrated.";

/**
 * Mounted in the dashboard. The first time a user lands there signed-in
 * with non-empty local schemas, offer to upload them to the cloud. Records
 * stay locally as a backup; the flag is set per-user so we never re-prompt.
 */
export function MigrationPrompt({ onMigrated }: { onMigrated: () => void }) {
  const { user } = useAuth();
  const [count, setCount] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Detect the trigger: signed in, no flag yet, local has records.
  useEffect(() => {
    if (!user) return;
    const flag = FLAG_PREFIX + user.id;
    if (localStorage.getItem(flag)) return;

    let cancelled = false;
    listLocalRecords().then((recs) => {
      if (cancelled) return;
      if (recs.length === 0) {
        localStorage.setItem(flag, "1");
        return;
      }
      setCount(recs.length);
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  function dismiss() {
    if (user) localStorage.setItem(FLAG_PREFIX + user.id, "1");
    setOpen(false);
  }

  async function upload() {
    if (!user) return;
    const flag = FLAG_PREFIX + user.id;
    // Set the flag *before* the network call so a second tab opening this
    // dialog at the same time doesn't kick off a duplicate upload.
    localStorage.setItem(flag, "1");
    setBusy(true);
    try {
      const recs = await listLocalRecords();
      const created = await uploadLocalRecords(recs);
      toast.success(
        `Uploaded ${created.length} schema${created.length === 1 ? "" : "s"}`,
      );
      setOpen(false);
      onMigrated();
    } catch (e) {
      // Roll back so the user can retry.
      localStorage.removeItem(flag);
      toast.error("Couldn't upload schemas", { description: formatError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && dismiss()}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-collab/20 text-primary">
            <Sparkles className="size-5" />
          </div>
          <DialogTitle>
            Upload your local {count === 1 ? "schema" : "schemas"}?
          </DialogTitle>
          <DialogDescription>
            We found {count} schema{count === 1 ? "" : "s"} saved on this
            device. Upload {count === 1 ? "it" : "them"} to your account so
            you can access {count === 1 ? "it" : "them"} from anywhere. Your
            local copies stay as a backup.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={dismiss} disabled={busy}>
            Skip
          </Button>
          <Button onClick={upload} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Uploading…
              </>
            ) : (
              `Upload ${count} schema${count === 1 ? "" : "s"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
