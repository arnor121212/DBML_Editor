import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  Download,
  FileCode2,
  Image as ImageIcon,
  LayoutGrid,
  Maximize,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSchemaStore } from "@/store/schemaStore";
import { register, run } from "@/lib/commands/registry";
import {
  exportPng,
  exportSvg,
  downloadDataUrl,
} from "@/lib/exports/image";
import { exportSql, downloadFile, type SqlDialect } from "@/lib/exports/sql";
import { formatError } from "@/lib/utils";

interface Props {
  flowRef: React.RefObject<HTMLDivElement | null>;
}

export function DiagramToolbar({ flowRef }: Props) {
  const { fitView } = useReactFlow();

  // Register the four palette-shareable diagram actions. Buttons in this
  // component call `run(id)` instead of local closures so the command
  // palette and the toolbar always stay in sync. Reading `name`/`nodes`
  // from the store inside the handler (via getState) keeps deps stable so
  // the effect runs once per mount.
  useEffect(() => {
    return register(
      {
        id: "diagram.fit",
        label: "Fit to view",
        icon: Maximize,
        scope: "hasSchema",
        group: "Diagram",
        handler: () => {
          void fitView({ duration: 400, padding: 0.2 });
        },
      },
      {
        id: "diagram.autoLayout",
        label: "Auto-layout diagram",
        icon: LayoutGrid,
        scope: "canEdit",
        group: "Diagram",
        handler: () => {
          useSchemaStore.getState().applyAutoLayout("LR");
          setTimeout(() => fitView({ duration: 400, padding: 0.2 }), 50);
          toast.success("Auto-layout applied");
        },
      },
      {
        id: "diagram.exportPng",
        label: "Export as PNG",
        icon: ImageIcon,
        scope: "hasSchema",
        group: "Export",
        handler: async () => {
          if (!flowRef.current) return;
          const { name, nodes } = useSchemaStore.getState();
          try {
            const dataUrl = await exportPng({
              flowEl: flowRef.current,
              nodes,
              background:
                getComputedStyle(document.documentElement).getPropertyValue(
                  "--color-background",
                ) || "#0b1020",
            });
            downloadDataUrl(`${slugify(name)}.png`, dataUrl);
            toast.success("Exported PNG");
          } catch (e) {
            toast.error("Could not export PNG", { description: formatError(e) });
          }
        },
      },
      {
        id: "diagram.exportSvg",
        label: "Export as SVG",
        icon: ImageIcon,
        scope: "hasSchema",
        group: "Export",
        handler: async () => {
          if (!flowRef.current) return;
          const { name, nodes } = useSchemaStore.getState();
          try {
            const data = await exportSvg({
              flowEl: flowRef.current,
              nodes,
              background: "transparent",
            });
            downloadDataUrl(`${slugify(name)}.svg`, data);
            toast.success("Exported SVG");
          } catch (e) {
            toast.error("Could not export SVG", { description: formatError(e) });
          }
        },
      },
    );
  }, [fitView, flowRef]);

  // SQL exports stay local — they're nested in a dropdown with three
  // dialect choices, which doesn't map cleanly onto a flat command list.
  const handleSql = (dialect: SqlDialect) => {
    const { dbml, name } = useSchemaStore.getState();
    try {
      const sql = exportSql(dbml, dialect);
      downloadFile(`${slugify(name)}.${dialect}.sql`, sql, "text/plain;charset=utf-8");
      toast.success(`Exported ${labelFor(dialect)} SQL`);
    } catch (e) {
      toast.error("SQL export failed", { description: formatError(e) });
    }
  };

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-surface/90 p-1 shadow-lg backdrop-blur">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => run("diagram.autoLayout")}
            aria-label="Auto-layout"
          >
            <LayoutGrid />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Auto-layout</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => run("diagram.fit")}
            aria-label="Fit"
          >
            <Maximize />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Fit to view</TooltipContent>
      </Tooltip>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-1.5 px-2">
                <Download className="size-3.5" /> Export
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Export diagram</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuLabel>Image</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => run("diagram.exportPng")}>
            <ImageIcon /> PNG
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run("diagram.exportSvg")}>
            <ImageIcon /> SVG
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>SQL</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => handleSql("postgres")}>
            <FileCode2 /> PostgreSQL
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleSql("mysql")}>
            <FileCode2 /> MySQL
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleSql("mssql")}>
            <FileCode2 /> MSSQL
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function slugify(name: string): string {
  return (name || "schema").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function labelFor(d: SqlDialect): string {
  if (d === "postgres") return "PostgreSQL";
  if (d === "mysql") return "MySQL";
  return "MSSQL";
}
