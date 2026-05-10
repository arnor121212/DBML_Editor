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
import { parseDbml } from "@/lib/dbml/parse";
import { formatError } from "@/lib/utils";

type Dialect = "postgres" | "mysql" | "mssql";
type Mode = "append" | "replace";

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
  const [mode, setMode] = useState<Mode>("append");
  const [busy, setBusy] = useState(false);
  const setDbml = useSchemaStore((s) => s.setDbml);

  function reset() {
    setSql("");
    setDialect("postgres");
    setMode("append");
    setBusy(false);
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  function handleImport() {
    const text = sql.trim();
    if (!text) return;
    setBusy(true);
    try {
      const importedDbml = importer.import(text, dialect);

      if (mode === "replace") {
        const current = useSchemaStore.getState().dbml.trim();
        if (current.length > 0) {
          const ok = window.confirm(
            "Replacing will discard the current schema. Continue?",
          );
          if (!ok) {
            setBusy(false);
            return;
          }
        }
        setDbml(importedDbml);
        toast.success("Imported SQL", {
          description: `Replaced schema with ${tableCountLabel(importedDbml)}.`,
        });
        close();
        return;
      }

      // Append mode: detect table-name collisions before merging.
      const current = useSchemaStore.getState().dbml;
      const conflicts = findTableConflicts(current, importedDbml);
      if (conflicts.length > 0) {
        toast.error("Couldn't add tables", {
          description: `Already in this schema: ${conflicts.join(", ")}. Rename them in the SQL first or pick "Replace".`,
        });
        setBusy(false);
        return;
      }

      const merged = current.trimEnd().length === 0
        ? importedDbml
        : `${current.trimEnd()}\n\n${importedDbml}`;
      setDbml(merged);
      toast.success("Added to schema", {
        description: `Imported ${tableCountLabel(importedDbml)}.`,
      });
      close();
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
        if (!next) close();
        else onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Download className="size-4" /> Import SQL DDL
          </DialogTitle>
          <DialogDescription>
            Paste a SQL schema dump (CREATE TABLE statements) and pick its
            dialect.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="sql-mode">Action</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger id="sql-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="append">Add to schema</SelectItem>
                  <SelectItem value="replace">Replace schema</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sql-dialect">Dialect</Label>
              <Select value={dialect} onValueChange={(v) => setDialect(v as Dialect)}>
                <SelectTrigger id="sql-dialect">
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
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={busy || !sql.trim()}>
            {busy ? "Importing…" : mode === "append" ? "Add to schema" : "Replace schema"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Return table ids (`schema.name`) that exist in BOTH `currentDbml` and
 * `importedDbml`. Both are parsed via the project parser; an unparseable
 * `currentDbml` is treated as having no tables (a safe lower bound — at
 * worst the merge produces a duplicate the parser will then surface).
 */
function findTableConflicts(currentDbml: string, importedDbml: string): string[] {
  const cur = parseDbml(currentDbml);
  const imp = parseDbml(importedDbml);
  if (!cur.ok || !imp.ok) return [];
  const existing = new Set(cur.schema.tables.map((t) => t.id));
  return imp.schema.tables
    .filter((t) => existing.has(t.id))
    .map((t) => t.name);
}

function tableCountLabel(dbml: string): string {
  const r = parseDbml(dbml);
  if (!r.ok) return "tables";
  const n = r.schema.tables.length;
  return `${n} table${n === 1 ? "" : "s"}`;
}
