import { memo, useMemo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  KeyRound,
  Link2,
  Asterisk,
  ShieldCheck,
} from "lucide-react";
import type { TableNodeData } from "@/lib/dbml/toFlow";
import { typeColorVar } from "@/lib/dbml/typeColor";
import { pickHeaderColor } from "@/lib/dbml/palette";
import { useSchemaStore } from "@/store/schemaStore";
import { cn } from "@/lib/utils";

const NODE_WIDTH = 280;

/**
 * Invisible 1×1 handle. Rendered inside a `position: relative` row, so its
 * default vertical center (top: 50%) lands on the row's center — no offset
 * math needed. Positioned at the row's left/right edge by React Flow.
 */
function InlineHandle({
  type,
  position,
  id,
}: {
  type: "source" | "target";
  position: Position;
  id: string;
}) {
  return (
    <Handle
      type={type}
      position={position}
      id={id}
      style={{
        background: "transparent",
        border: "none",
        width: 1,
        height: 1,
        minWidth: 1,
        minHeight: 1,
      }}
      isConnectable={false}
    />
  );
}

type TableNodeProps = NodeProps<Node<TableNodeData>>;

function TableNodeInner({ data, selected }: TableNodeProps) {
  const setHovered = useSchemaStore((s) => s.setHoveredColumn);
  const hoveredKey = useSchemaStore((s) => s.hoveredColumnKey);
  const edges = useSchemaStore((s) => s.edges);

  const headerColor = useMemo(
    () => pickHeaderColor(data.name, data.headerColor),
    [data.name, data.headerColor],
  );

  const isDimmed = useMemo(() => {
    if (!hoveredKey) return false;
    const [hTable] = hoveredKey.split("::");
    if (hTable === data.id) return false;
    // Connected if any edge has both endpoints across hovered table and this table.
    return !edges.some(
      (e) =>
        (e.source === hTable && e.target === data.id) ||
        (e.target === hTable && e.source === data.id),
    );
  }, [hoveredKey, data.id, edges]);

  return (
    <div
      className={cn(
        "group/table relative w-[280px] select-none rounded-xl border border-border bg-card text-card-foreground shadow-[0_1px_0_0_color-mix(in_oklab,white_4%,transparent)_inset,0_8px_30px_-12px_rgba(0,0,0,0.5)] transition-[opacity,transform,box-shadow] duration-200",
        selected && "ring-2 ring-primary/60",
        isDimmed && "opacity-30",
      )}
      style={{ width: NODE_WIDTH }}
    >
      {/* Colored header */}
      <div
        className="relative flex h-11 items-center gap-2 overflow-hidden rounded-t-[11px] px-3"
        style={{
          background: `linear-gradient(135deg, color-mix(in oklab, ${headerColor} 22%, transparent), color-mix(in oklab, ${headerColor} 8%, transparent))`,
          borderBottom: `1px solid color-mix(in oklab, ${headerColor} 30%, var(--color-border))`,
        }}
      >
        <span
          className="absolute left-0 top-0 h-full w-1"
          style={{ background: headerColor }}
        />
        <span className="ml-1 truncate font-mono text-[13px] font-semibold tracking-tight text-foreground">
          {data.name}
        </span>
        {data.note && (
          <span className="ml-auto truncate text-[11px] text-muted-foreground">
            {data.note}
          </span>
        )}
        <span
          className="ml-auto rounded-full border border-border/70 bg-background/40 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
          aria-label={`${data.columns.length} columns`}
        >
          {data.columns.length}
        </span>
      </div>

      {/* Column rows */}
      <div className="py-1">
        {data.columns.map((col) => {
          const rowKey = `${data.id}::${col.name}`;
          const isHovered = hoveredKey === rowKey;
          return (
            <div
              key={col.name}
              className={cn(
                "group/row relative flex h-7 items-center gap-2 px-3 text-[12.5px] transition-colors",
                isHovered &&
                  "bg-[color-mix(in_oklab,var(--color-primary)_14%,transparent)]",
                !isHovered &&
                  "hover:bg-[color-mix(in_oklab,var(--color-foreground)_4%,transparent)]",
              )}
              onMouseEnter={() => setHovered(rowKey)}
              onMouseLeave={() => setHovered(null)}
            >
              <InlineHandle
                type="target"
                position={Position.Left}
                id={`${col.name}.target`}
              />
              <InlineHandle
                type="source"
                position={Position.Right}
                id={`${col.name}.source`}
              />

              {/* PK / FK glyph */}
              <span className="flex w-3.5 shrink-0 items-center justify-center">
                {col.pk ? (
                  <KeyRound className="size-3 text-[oklch(0.82_0.16_85)]" />
                ) : col.isFk ? (
                  <Link2 className="size-3 text-[oklch(0.72_0.18_245)]" />
                ) : (
                  <span className="size-1.5 rounded-full bg-muted-foreground/25" />
                )}
              </span>

              {/* Name */}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-mono",
                  col.pk && "font-semibold",
                )}
                title={col.name}
              >
                {col.name}
              </span>

              {/* Type pill */}
              <span
                className="shrink-0 rounded-md border px-1.5 py-px font-mono text-[10.5px] font-medium leading-tight"
                style={{
                  color: typeColorVar(col.type),
                  borderColor: `color-mix(in oklab, ${typeColorVar(col.type)} 25%, var(--color-border))`,
                  background: `color-mix(in oklab, ${typeColorVar(col.type)} 10%, transparent)`,
                }}
                title={col.type}
              >
                {col.type}
              </span>

              {/* Flags */}
              {col.notNull && (
                <Asterisk
                  className="size-3 shrink-0 text-muted-foreground/70"
                  aria-label="not null"
                />
              )}
              {col.unique && (
                <ShieldCheck
                  className="size-3 shrink-0 text-[oklch(0.74_0.16_295)]"
                  aria-label="unique"
                />
              )}
            </div>
          );
        })}

        {data.columns.length === 0 && (
          <div className="px-3 py-3 text-[11px] italic text-muted-foreground">
            No columns yet.
          </div>
        )}
      </div>
    </div>
  );
}

export const TableNode = memo(TableNodeInner);
