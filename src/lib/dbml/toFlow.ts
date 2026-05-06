import type { Edge, Node } from "@xyflow/react";
import type { RefModel, SchemaModel, TableModel } from "./types";

export type Positions = Record<string, { x: number; y: number }>;

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
): { nodes: Node<TableNodeData>[]; edges: Edge<RelationEdgeData>[] } {
  const fallback = gridFallback(schema.tables);

  const nodes: Node<TableNodeData>[] = schema.tables.map((t) => ({
    id: t.id,
    type: "table",
    position: positions[t.id] ?? fallback[t.id] ?? { x: 0, y: 0 },
    data: t,
    draggable: true,
  }));

  const edges: Edge<RelationEdgeData>[] = [];
  for (const r of schema.refs) {
    const sCols = r.source.columns;
    const tCols = r.target.columns;
    // One edge per source column (composite refs are rare; this preserves clarity).
    for (let i = 0; i < sCols.length; i++) {
      const sCol = sCols[i];
      const tCol = tCols[i] ?? tCols[0];
      edges.push({
        id: `${r.id}__${sCol}_${tCol}`,
        source: r.source.tableId,
        target: r.target.tableId,
        sourceHandle: `${sCol}.source`,
        targetHandle: `${tCol}.target`,
        type: "relation",
        data: {
          sourceColumns: r.source.columns,
          targetColumns: r.target.columns,
          kind: r.kind,
        },
        // Use react flow markerEnd by default — but our custom edge draws its own.
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
