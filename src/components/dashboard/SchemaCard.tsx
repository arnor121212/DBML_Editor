import { Link } from "react-router-dom";
import {
  Copy,
  MoreHorizontal,
  Pencil,
  Trash2,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";
import type { SchemaSummary } from "@/lib/storage";

interface Props {
  schema: SchemaSummary;
  onRename: (s: SchemaSummary) => void;
  onDuplicate: (s: SchemaSummary) => void;
  onDelete: (s: SchemaSummary) => void;
}

export function SchemaCard({ schema, onRename, onDuplicate, onDelete }: Props) {
  return (
    <Card className="group/card relative overflow-hidden p-0 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_color-mix(in_oklab,var(--color-primary)_45%,transparent)]">
      <Link
        to={`/s/${schema.id}`}
        className="block h-full p-5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <PreviewIllustration />
        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-primary">
            <Database className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold tracking-tight">
              {schema.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {schema.tableCount} {schema.tableCount === 1 ? "table" : "tables"} ·
              edited {formatRelativeTime(schema.updatedAt)}
            </p>
          </div>
        </div>
      </Link>
      <div
        className="absolute right-2 top-2 opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="Actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onRename(schema)}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(schema)}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(schema)}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}

function PreviewIllustration() {
  return (
    <div className="relative h-24 w-full overflow-hidden rounded-md border border-border bg-grid bg-surface-2">
      <div className="absolute left-3 top-3 h-12 w-20 rounded-md border border-border bg-card shadow-md">
        <div className="h-2 rounded-t-md" style={{ background: "oklch(0.7 0.16 245)" }} />
        <div className="space-y-0.5 p-1.5">
          <div className="h-1 w-2/3 rounded bg-muted" />
          <div className="h-1 w-3/4 rounded bg-muted" />
          <div className="h-1 w-1/2 rounded bg-muted" />
        </div>
      </div>
      <div className="absolute right-3 top-7 h-12 w-20 rounded-md border border-border bg-card shadow-md">
        <div className="h-2 rounded-t-md" style={{ background: "oklch(0.72 0.18 295)" }} />
        <div className="space-y-0.5 p-1.5">
          <div className="h-1 w-1/2 rounded bg-muted" />
          <div className="h-1 w-3/4 rounded bg-muted" />
          <div className="h-1 w-2/3 rounded bg-muted" />
        </div>
      </div>
      <svg
        className="absolute inset-0 h-full w-full text-muted-foreground/40"
        viewBox="0 0 240 96"
        fill="none"
      >
        <path
          d="M 95 28 C 110 28 120 50 145 50"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      </svg>
    </div>
  );
}
