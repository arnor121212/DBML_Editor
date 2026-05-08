import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  initialName: string;
  onClose: () => void;
  onConfirm: (name: string) => void | Promise<void>;
  /** Title above the input. Default: "Rename schema". */
  title?: string;
  /** Label above the input. Default: "Name". */
  label?: string;
  /** Submit button label. Default: "Save". */
  submitLabel?: string;
  /** What to substitute when the input is blank. Default: "Untitled schema". */
  fallback?: string;
  /** Placeholder for the input. */
  placeholder?: string;
}

export function RenameDialog({
  open,
  initialName,
  onClose,
  onConfirm,
  title = "Rename schema",
  label = "Name",
  submitLabel = "Save",
  fallback = "Untitled schema",
  placeholder,
}: Props) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  async function submit() {
    const trimmed = name.trim() || fallback;
    await onConfirm(trimmed);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="rename-name">{label}</Label>
          <Input
            id="rename-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={placeholder}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>{submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
