import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  schemaName: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export function DeleteConfirmDialog({
  open,
  schemaName,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this schema?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{schemaName}</span> will
            be permanently removed. This action can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
