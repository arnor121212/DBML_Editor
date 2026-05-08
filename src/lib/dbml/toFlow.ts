import type { Edge, Node } from "@xyflow/react";
import type { RefModel, SchemaModel, TableModel } from "./types";

export type Positions = Record<string, { x: number; y: number }>;
export type Widths = Record<string, number>;
export type EdgeSide = "l" | "r";
export type EdgeSides = Record<
  string,
  { srcSide: EdgeSide; tgtSide: EdgeSide }
>;

/** Stable key for an edge-side override, derived from the ref endpoints. */
export function edgeSideKey(
  srcTableId: string,
  srcCol: string,
  tgtTableId: string,
  tgtCol: string,
): string {
  return `${srcTableId}.${srcCol}>${tgtTableId}.${tgtCol}`;
}

/** Handle IDs follow `${col}.${type}.${side}` so each row exposes four
 *  attachment points. The legacy bare `${col}.source` / `${col}.target` IDs
 *  are no longer emitted; toFlow always produces the side-suffixed form. */
export function handleId(
  col: string,
  type: "source" | "target",
  side: EdgeSide,
): string {
  return `${col}.${type}.${side}`;
}

/** Default node width — kept in sync with `TableNode` styling. */
export const DEFAULT_NODE_WIDTH = 280;
export const MIN_NODE_WIDTH = 240;
export const MAX_NODE_WIDTH = 560;

export type TableNodeData = TableModel;
export type RelationEdgeData = {
  sourceColumns: string[];
  targetColumns: string[];
  kind: RefModel["kind"];
  [key: string]: unknown;
};

/**
 * Build React Flow nodes/edges from a parsed schema and a positions map.
 * Tables without a saved position are placed on a temporary grid; the
 * caller can then call `applyAutoLayout` to spread them.
 */
export function toFlow(
  schema: SchemaModel,
  positions: Positions,
  widths: Widths = {},
  edgeSides: EdgeSides = {},
): { nodes: Node<TableNodeData>[]; edges: Edge<RelationEdgeData>[] } {
  const fallback = gridFallback(schema.tables);

  const nodes: Node<TableNodeData>[] = schema.tables.map((t) => ({
    id: t.id,
    type: "table",
    position: positions[t.id] ?? fallback[t.id] ?? { x: 0, y: 0 },
    data: t,
    draggable: true,
    // Always set width so React Flow's wrapper has a concrete size — needed
    // for the right-edge resize handle to work consistently across nodes.
    style: { width: widths[t.id] ?? DEFAULT_NODE_WIDTH },
  }));

  const edges: Edge<RelationEdgeData>[] = [];
  for (const r of schema.refs) {
    const sCols = r.source.columns;
    const tCols = r.target.columns;
    // One edge per source column (composite refs are rare; this preserves clarity).
    for (let i = 0; i < sCols.length; i++) {
      const sCol = sCols[i];
      const tCol = tCols[i] ?? tCols[0];
      const override =
        edgeSides[edgeSideKey(r.source.tableId, sCol, r.target.tableId, tCol)];
      // Default: source on the right, target on the left — the
      // historical render direction. Overrides come from drag-creation.
      const srcSide: EdgeSide = override?.srcSide ?? "r";
      const tgtSide: EdgeSide = override?.tgtSide ?? "l";
      edges.push({
        id: `${r.id}__${sCol}_${tCol}`,
        source: r.source.tableId,
        target: r.target.tableId,
        sourceHandle: handleId(sCol, "source", srcSide),
        targetHandle: handleId(tCol, "target", tgtSide),
        type: "relation",
        data: {
          sourceColumns: r.source.columns,
          targetColumns: r.target.columns,
          kind: r.kind,
        },
      });
    }
  }

  return { nodes, edges };
}

function gridFallback(tables: TableModel[]): Positions {
  const out: Positions = {};
  const COLS = 3;
  const W = 320;
  const H = 320;
  tables.forEach((t, i) => {
    out[t.id] = { x: (i % COLS) * W, y: Math.floor(i / COLS) * H };
  });
  return out;
}
