import { Link } from "react-router-dom";
import {
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
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
import type { ProjectSummary } from "@/lib/storage";

interface Props {
  project: ProjectSummary;
  onRename: (p: ProjectSummary) => void;
  onDelete: (p: ProjectSummary) => void;
}

export function ProjectCard({ project, onRename, onDelete }: Props) {
  const empty = project.schemaCount === 0;
  return (
    <Card className="group/card relative overflow-hidden p-0 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_color-mix(in_oklab,var(--color-primary)_45%,transparent)]">
      <Link
        to={`/p/${project.id}`}
        className="block h-full p-5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {empty ? <EmptyStack /> : <SchemaStack count={project.schemaCount} />}
        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-collab transition-colors group-hover/card:text-primary">
            {empty ? (
              <Folder className="size-4" />
            ) : (
              <FolderOpen className="size-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold tracking-tight">
              {project.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {project.schemaCount}{" "}
              {project.schemaCount === 1 ? "schema" : "schemas"}
              {!empty && (
                <>
                  {" · "}
                  edited {formatRelativeTime(project.updatedAt)}
                </>
              )}
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
            <Button size="icon-sm" variant="ghost" aria-label="Project actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onRename(project)}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(project)}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}

/**
 * "Stacked deck" — three mini-schema cards offset diagonally, with the back
 * card dimmest and the front card brightest. Reads as "folder of schemas"
 * without drawing a literal folder icon.
 */
function SchemaStack({ count }: { count: number }) {
  return (
    <div className="relative h-24 w-full overflow-hidden rounded-md border border-border bg-grid bg-surface-2">
      {/* back layer — most muted */}
      <MiniSchema
        className="absolute left-3 top-2.5 -rotate-3 opacity-60"
        accent="oklch(0.7 0.14 200)"
        accent2="oklch(0.7 0.16 245)"
      />
      {/* middle layer */}
      <MiniSchema
        className="absolute left-7 top-4 rotate-1 opacity-85"
        accent="oklch(0.7 0.18 295)"
        accent2="oklch(0.7 0.16 65)"
      />
      {/* front layer — brightest */}
      <MiniSchema
        className="absolute left-12 top-6 rotate-3 shadow-[0_8px_20px_-10px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
        accent="oklch(0.62 0.19 252)"
        accent2="oklch(0.66 0.21 295)"
      />
      {/* count badge */}
      <span
        aria-hidden
        className="absolute right-2 top-2 rounded-full border border-border bg-card/80 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider text-muted-foreground backdrop-blur"
      >
        ×{count}
      </span>
    </div>
  );
}

function MiniSchema({
  className,
  accent,
  accent2,
}: {
  className?: string;
  accent: string;
  accent2: string;
}) {
  return (
    <div
      className={`h-14 w-24 rounded-md border border-border bg-card ${className ?? ""}`}
    >
      <div className="flex">
        <div
          className="h-1.5 flex-1 rounded-tl-md"
          style={{ background: accent }}
        />
        <div
          className="h-1.5 flex-1 rounded-tr-md opacity-80"
          style={{ background: accent2 }}
        />
      </div>
      <div className="space-y-0.5 p-1.5">
        <div className="h-1 w-2/3 rounded bg-muted" />
        <div className="h-1 w-3/4 rounded bg-muted" />
        <div className="h-1 w-1/2 rounded bg-muted" />
      </div>
    </div>
  );
}

function EmptyStack() {
  return (
    <div className="relative grid h-24 w-full place-items-center overflow-hidden rounded-md border border-dashed border-border bg-surface-2/40">
      <div className="flex flex-col items-center gap-1 text-muted-foreground/70">
        <Folder className="size-5" />
        <span className="text-[11px] tracking-wide">empty</span>
      </div>
    </div>
  );
}
