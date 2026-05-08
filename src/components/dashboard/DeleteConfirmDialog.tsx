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
  /** Highlighted entity name shown inside the description. */
  schemaName: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  /** Override for the dialog title. Default: "Delete this schema?" */
  title?: string;
  /** Trailing copy after the highlighted name. Default: "will be permanently removed. This action can't be undone." */
  trailing?: string;
}

export function DeleteConfirmDialog({
  open,
  schemaName,
  onClose,
  onConfirm,
  title = "Delete this schema?",
  trailing = "will be permanently removed. This action can't be undone.",
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{schemaName}</span>{" "}
            {trailing}
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
