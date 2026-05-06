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
  const applyAutoLayout = useSchemaStore((s) => s.applyAutoLayout);
  const dbml = useSchemaStore((s) => s.dbml);
  const name = useSchemaStore((s) => s.name);
  const nodes = useSchemaStore((s) => s.nodes);

  const slug = (name || "schema").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  const handleAutoLayout = () => {
    applyAutoLayout("LR");
    setTimeout(() => fitView({ duration: 400, padding: 0.2 }), 50);
    toast.success("Auto-layout applied");
  };

  const handleFit = () => fitView({ duration: 400, padding: 0.2 });

  const handlePng = async () => {
    if (!flowRef.current) return;
    try {
      const dataUrl = await exportPng({
        flowEl: flowRef.current,
        nodes,
        background:
          getComputedStyle(document.documentElement).getPropertyValue("--color-background") ||
          "#0b1020",
      });
      downloadDataUrl(`${slug}.png`, dataUrl);
      toast.success("Exported PNG");
    } catch (e) {
      toast.error("Could not export PNG", { description: formatError(e) });
    }
  };

  const handleSvg = async () => {
    if (!flowRef.current) return;
    try {
      const data = await exportSvg({
        flowEl: flowRef.current,
        nodes,
        background: "transparent",
      });
      downloadDataUrl(`${slug}.svg`, data);
      toast.success("Exported SVG");
    } catch (e) {
      toast.error("Could not export SVG", { description: formatError(e) });
    }
  };

  const handleSql = (dialect: SqlDialect) => {
    try {
      const sql = exportSql(dbml, dialect);
      downloadFile(`${slug}.${dialect}.sql`, sql, "text/plain;charset=utf-8");
      toast.success(`Exported ${labelFor(dialect)} SQL`);
    } catch (e) {
      toast.error("SQL export failed", { description: formatError(e) });
    }
  };

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-surface/90 p-1 shadow-lg backdrop-blur">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon-sm" variant="ghost" onClick={handleAutoLayout} aria-label="Auto-layout">
            <LayoutGrid />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Auto-layout</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon-sm" variant="ghost" onClick={handleFit} aria-label="Fit">
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
          <DropdownMenuItem onClick={handlePng}>
            <ImageIcon /> PNG
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleSvg}>
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

function labelFor(d: SqlDialect): string {
  if (d === "postgres") return "PostgreSQL";
  if (d === "mysql") return "MySQL";
  return "MSSQL";
}
