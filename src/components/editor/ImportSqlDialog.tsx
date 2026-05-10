import { useState } from "react";
import { importer } from "@dbml/core";
import { toast } from "sonner";
import { Download } from "lucide-react";
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
import { useSchemaStore } from "@/store/schemaStore";
import { formatError } from "@/lib/utils";

type Dialect = "postgres" | "mysql" | "mssql";

const DIALECTS: { value: Dialect; label: string }[] = [
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "mssql", label: "SQL Server" },
];

export function ImportSqlDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [sql, setSql] = useState("");
  const [dialect, setDialect] = useState<Dialect>("postgres");
  const [busy, setBusy] = useState(false);
  const setDbml = useSchemaStore((s) => s.setDbml);
  const currentDbml = useSchemaStore((s) => s.dbml);

  function reset() {
    setSql("");
    setDialect("postgres");
    setBusy(false);
  }

  function handleImport() {
    const text = sql.trim();
    if (!text) return;
    setBusy(true);
    try {
      const dbml = importer.import(text, dialect);
      const replacing = currentDbml.trim().length > 0;
      if (replacing) {
        const ok = window.confirm(
          "Importing will replace the current schema. Continue?",
        );
        if (!ok) {
          setBusy(false);
          return;
        }
      }
      setDbml(dbml);
      toast.success("Imported SQL", {
        description: `Converted ${DIALECTS.find((d) => d.value === dialect)?.label} DDL to DBML.`,
      });
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error("Couldn't import SQL", { description: formatError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Download className="size-4" /> Import SQL DDL
          </DialogTitle>
          <DialogDescription>
            Paste a SQL schema dump (CREATE TABLE statements) and pick its
            dialect. The result replaces the current DBML.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-2">
            <Label htmlFor="sql-dialect">Dialect</Label>
            <Select value={dialect} onValueChange={(v) => setDialect(v as Dialect)}>
              <SelectTrigger id="sql-dialect" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIALECTS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sql-source">SQL</Label>
            <textarea
              id="sql-source"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              placeholder="CREATE TABLE users (&#10;  id SERIAL PRIMARY KEY,&#10;  email VARCHAR(255) NOT NULL UNIQUE&#10;);"
              spellCheck={false}
              className="h-64 w-full resize-none rounded-md border border-border bg-surface-2 p-2 font-mono text-xs outline-none focus:border-primary"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={busy || !sql.trim()}>
            {busy ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
