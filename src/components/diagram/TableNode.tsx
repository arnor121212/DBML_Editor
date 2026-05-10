import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Handle,
  NodeResizeControl,
  Position,
  ResizeControlVariant,
  type Node,
  type NodeProps,
  type ResizeParams,
} from "@xyflow/react";
import {
  KeyRound,
  Link2,
  Asterisk,
  ShieldCheck,
} from "lucide-react";
import {
  MAX_NODE_WIDTH,
  MIN_NODE_WIDTH,
  type TableNodeData,
} from "@/lib/dbml/toFlow";
import { typeColorVar } from "@/lib/dbml/typeColor";
import { pickHeaderColor } from "@/lib/dbml/palette";
import { useSchemaStore } from "@/store/schemaStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Connection handle. Rendered inside a `position: relative` row, so its
 * default vertical center (top: 50%) lands on the row's center.
 *
 * Visible only when the row is hovered (`opacity-0` → `opacity-100` via the
 * `group-hover/row` Tailwind variant) — keeps the diagram clean at rest
 * while still giving users something concrete to grab when drawing a ref.
 *
 * The 1×1 size still applies when hidden so layout-positioned siblings
 * don't shift between hover states; the visual dot is an absolutely
 * positioned pseudo-child sized via the className.
 */
function InlineHandle({
  type,
  position,
  id,
  connectable,
}: {
  type: "source" | "target";
  position: Position;
  id: string;
  connectable: boolean;
}) {
  return (
    <Handle
      type={type}
      position={position}
      id={id}
      isConnectable={connectable}
      className={cn(
        "!h-2.5 !w-2.5 !border-2 !border-primary/70 !bg-background opacity-0 transition-opacity",
        // Visible whenever the table is hovered (not just the row) — moving
        // the cursor onto the dot itself can leave the row's hover region.
        connectable && "group-hover/table:opacity-100",
        !connectable && "!pointer-events-none",
      )}
    />
  );
}

type TableNodeProps = NodeProps<Node<TableNodeData>>;

function TableNodeInner({ id, data, selected }: TableNodeProps) {
  const setHovered = useSchemaStore((s) => s.setHoveredColumn);
  const hoveredKey = useSchemaStore((s) => s.hoveredColumnKey);
  const edges = useSchemaStore((s) => s.edges);
  const renameTable = useSchemaStore((s) => s.renameTable);
  const editColumn = useSchemaStore((s) => s.editColumn);
  const setWidth = useSchemaStore((s) => s.setWidth);
  const canEdit = useSchemaStore((s) => s.canEdit);

  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(data.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingCol, setEditingCol] =
    useState<{ name: string; field: "name" | "type" } | null>(null);

  // Reset draft if the underlying name changes (e.g. external edit).
  useEffect(() => {
    setDraftName(data.name);
  }, [data.name]);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

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

  const commitRename = useCallback(() => {
    const next = draftName.trim();
    setRenaming(false);
    if (!next || next === data.name) {
      setDraftName(data.name);
      return;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(next)) {
      toast.error("Invalid table name", {
        description: "Use letters, digits, and underscores. Must start with a letter or underscore.",
      });
      setDraftName(data.name);
      return;
    }
    const ok = renameTable(id, next);
    if (!ok) {
      toast.error("Couldn't rename table", {
        description: `A table named "${next}" already exists.`,
      });
      setDraftName(data.name);
    }
  }, [draftName, data.name, id, renameTable]);

  const onResizeEnd = useCallback(
    (_e: unknown, params: ResizeParams) => {
      setWidth(id, params.width);
    },
    [id, setWidth],
  );

  return (
    <div
      className={cn(
        "group/table relative h-full w-full select-none rounded-xl border border-border bg-card text-card-foreground shadow-[0_1px_0_0_color-mix(in_oklab,white_4%,transparent)_inset,0_8px_30px_-12px_rgba(0,0,0,0.5)] transition-[opacity,transform,box-shadow] duration-200",
        selected && "ring-2 ring-primary/60",
        isDimmed && "opacity-30",
      )}
    >
      {canEdit && (
        <NodeResizeControl
          position="right"
          variant={ResizeControlVariant.Line}
          minWidth={MIN_NODE_WIDTH}
          maxWidth={MAX_NODE_WIDTH}
          onResizeEnd={onResizeEnd}
          style={{
            background: "transparent",
            border: "none",
            width: 6,
            right: -3,
          }}
        >
          <div
            className="h-full w-full cursor-ew-resize bg-transparent transition-colors hover:bg-primary/30"
            aria-label="Resize table"
          />
        </NodeResizeControl>
      )}

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
        {renaming ? (
          <input
            ref={inputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setDraftName(data.name);
                setRenaming(false);
              }
              // Don't let the key bubble — Delete/Backspace would otherwise
              // be consumed by React Flow as a node-delete.
              e.stopPropagation();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="ml-1 min-w-0 flex-1 rounded-sm border border-primary/40 bg-background/80 px-1 font-mono text-[13px] font-semibold tracking-tight text-foreground outline-none focus:border-primary"
          />
        ) : (
          <span
            className={cn(
              "ml-1 min-w-0 truncate font-mono text-[13px] font-semibold tracking-tight text-foreground",
              canEdit && "cursor-text",
            )}
            title={canEdit ? "Double-click to rename" : data.name}
            onDoubleClick={(e) => {
              if (!canEdit) return;
              e.stopPropagation();
              setDraftName(data.name);
              setRenaming(true);
            }}
          >
            {data.schema && data.schema !== "public" && (
              <span className="font-normal text-muted-foreground">{data.schema}.</span>
            )}
            {data.name}
          </span>
        )}
        {!renaming && data.note && (
          <span className="ml-auto truncate text-[11px] text-muted-foreground">
            {data.note}
          </span>
        )}
        {!renaming && (
          <span
            className="ml-auto rounded-full border border-border/70 bg-background/40 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
            aria-label={`${data.columns.length} columns`}
          >
            {data.columns.length}
          </span>
        )}
      </div>

      {/* Column rows */}
      <div className="py-1">
        {data.columns.map((col) => {
          const rowKey = `${data.id}::${col.name}`;
          const isHovered = hoveredKey === rowKey;
          const editing = editingCol?.name === col.name ? editingCol : null;
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
              {/* Four stacked handles per row — source+target on each side.
               *  React Flow's loose connectionMode lets the user drag in any
               *  direction; the handle the drag started on becomes the
               *  source, the drop target becomes target. The four IDs let
               *  toFlow attach a parsed edge to whichever sides match the
               *  user's recorded preference. */}
              <InlineHandle
                type="source"
                position={Position.Left}
                id={`${col.name}.source.l`}
                connectable={canEdit}
              />
              <InlineHandle
                type="target"
                position={Position.Left}
                id={`${col.name}.target.l`}
                connectable={canEdit}
              />
              <InlineHandle
                type="source"
                position={Position.Right}
                id={`${col.name}.source.r`}
                connectable={canEdit}
              />
              <InlineHandle
                type="target"
                position={Position.Right}
                id={`${col.name}.target.r`}
                connectable={canEdit}
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
              {editing?.field === "name" ? (
                <ColumnEditInput
                  initial={col.name}
                  className={cn(
                    "min-w-0 flex-1 rounded-sm border border-primary/40 bg-background/80 px-1 font-mono",
                    col.pk && "font-semibold",
                  )}
                  placeholder="column name"
                  onCommit={(value) => {
                    setEditingCol(null);
                    const next = value.trim();
                    if (!next || next === col.name) return;
                    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(next)) {
                      toast.error("Invalid column name", {
                        description:
                          "Use letters, digits, and underscores. Must start with a letter or underscore.",
                      });
                      return;
                    }
                    const ok = editColumn(id, col.name, { name: next });
                    if (!ok) {
                      toast.error("Couldn't rename column", {
                        description: `A column named "${next}" already exists in this table.`,
                      });
                    }
                  }}
                  onCancel={() => setEditingCol(null)}
                />
              ) : (
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-mono",
                    col.pk && "font-semibold",
                    canEdit && "cursor-text",
                  )}
                  title={canEdit ? "Double-click to rename column" : col.name}
                  onDoubleClick={(e) => {
                    if (!canEdit) return;
                    e.stopPropagation();
                    setEditingCol({ name: col.name, field: "name" });
                  }}
                >
                  {col.name}
                </span>
              )}

              {/* Type pill */}
              {editing?.field === "type" ? (
                <ColumnEditInput
                  initial={col.type}
                  className="w-24 shrink-0 rounded-sm border border-primary/40 bg-background/80 px-1 font-mono text-[10.5px]"
                  placeholder="type"
                  onCommit={(value) => {
                    setEditingCol(null);
                    const next = value.trim();
                    if (!next || next === col.type) return;
                    editColumn(id, col.name, { type: next });
                  }}
                  onCancel={() => setEditingCol(null)}
                />
              ) : (
                <span
                  className={cn(
                    "shrink-0 rounded-md border px-1.5 py-px font-mono text-[10.5px] font-medium leading-tight",
                    canEdit && "cursor-text",
                  )}
                  style={{
                    color: typeColorVar(col.type),
                    borderColor: `color-mix(in oklab, ${typeColorVar(col.type)} 25%, var(--color-border))`,
                    background: `color-mix(in oklab, ${typeColorVar(col.type)} 10%, transparent)`,
                  }}
                  title={canEdit ? "Double-click to change type" : col.type}
                  onDoubleClick={(e) => {
                    if (!canEdit) return;
                    e.stopPropagation();
                    setEditingCol({ name: col.name, field: "type" });
                  }}
                >
                  {col.type}
                </span>
              )}

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

function ColumnEditInput({
  initial,
  className,
  placeholder,
  onCommit,
  onCancel,
}: {
  initial: string;
  className?: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
        // Stop propagation so React Flow doesn't consume Backspace/Delete
        // as a node-delete while the user is mid-edit.
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      placeholder={placeholder}
      className={cn("outline-none focus:border-primary", className)}
    />
  );
}

export const TableNode = memo(TableNodeInner);
