import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { makeId, useStorage, type SchemaRecord } from "@/lib/storage";
import { BLANK_DBML, ECOMMERCE_DBML } from "@/lib/dbml/examples";
import { formatError } from "@/lib/utils";

type Template = "blank" | "ecommerce";

export function NewSchemaDialog({
  trigger,
  onCreated,
}: {
  trigger?: React.ReactNode;
  onCreated?: (rec: SchemaRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Untitled schema");
  const [template, setTemplate] = useState<Template>("ecommerce");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const storage = useStorage();

  async function create() {
    const now = Date.now();
    const rec: SchemaRecord = {
      id: makeId(),
      name: name.trim() || "Untitled schema",
      dbml: template === "ecommerce" ? ECOMMERCE_DBML : BLANK_DBML,
      positions: {},
      createdAt: now,
      updatedAt: now,
    };
    setBusy(true);
    try {
      await storage.put(rec);
      toast.success("Schema created");
      setOpen(false);
      onCreated?.(rec);
      navigate(`/s/${rec.id}`);
    } catch (e) {
      toast.error("Couldn't create schema", { description: formatError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus /> New schema
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new schema</DialogTitle>
          <DialogDescription>
            Pick a starting point. You can change everything later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My new schema"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="template">Template</Label>
            <Select value={template} onValueChange={(v) => setTemplate(v as Template)}>
              <SelectTrigger id="template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ecommerce">E-commerce sample</SelectItem>
                <SelectItem value="blank">Blank schema</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={create} disabled={busy}>
            {busy ? "Creating…" : "Create schema"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
