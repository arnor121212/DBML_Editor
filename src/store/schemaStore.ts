import { create } from "zustand";
import type { Edge, Node } from "@xyflow/react";
import type { ParseError, SchemaModel } from "@/lib/dbml/types";
import { parseDbml } from "@/lib/dbml/parse";
import {
  toFlow,
  type Positions,
  type RelationEdgeData,
  type TableNodeData,
} from "@/lib/dbml/toFlow";
import { autoLayout } from "@/lib/dbml/layout";
import { putSchema, type SchemaRecord } from "@/lib/storage/schemas";

interface SchemaState {
  // Identity
  schemaId: string | null;
  name: string;
  createdAt: number;
  // Source
  dbml: string;
  // Parsed
  schema: SchemaModel;
  errors: ParseError[];
  // Flow
  nodes: Node<TableNodeData>[];
  edges: Edge<RelationEdgeData>[];
  positions: Positions;
  // UI
  hoveredColumnKey: string | null; // `${tableId}::${column}`
  loaded: boolean;

  // Actions
  loadRecord: (rec: SchemaRecord) => void;
  reset: () => void;
  setName: (name: string) => void;
  setDbml: (text: string) => void;
  setNodes: (updater: (prev: Node<TableNodeData>[]) => Node<TableNodeData>[]) => void;
  setEdges: (updater: (prev: Edge<RelationEdgeData>[]) => Edge<RelationEdgeData>[]) => void;
  updatePosition: (id: string, pos: { x: number; y: number }) => void;
  applyAutoLayout: (direction?: "LR" | "TB") => void;
  setHoveredColumn: (key: string | null) => void;
  persist: () => Promise<void>;
}

const EMPTY_SCHEMA: SchemaModel = { tables: [], refs: [], enums: [] };

/**
 * Place tables that have no saved position to the right of the existing
 * cluster, preserving every existing table's position untouched.
 */
function placeNewTables(
  nodes: Node<TableNodeData>[],
  positions: Positions,
): Node<TableNodeData>[] {
  const placed = nodes.filter((n) => positions[n.id]);
  const unplaced = nodes.filter((n) => !positions[n.id]);
  if (unplaced.length === 0) return nodes;

  let baseX = 0;
  let baseY = 0;
  if (placed.length > 0) {
    const xs = placed.map((n) => positions[n.id].x);
    const ys = placed.map((n) => positions[n.id].y);
    baseX = Math.max(...xs) + 360; // node width + margin
    baseY = Math.min(...ys);
  }
  unplaced.forEach((n, i) => {
    positions[n.id] = { x: baseX, y: baseY + i * 320 };
  });
  return nodes.map((n) => ({ ...n, position: positions[n.id] }));
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  schemaId: null,
  name: "Untitled schema",
  createdAt: 0,
  dbml: "",
  schema: EMPTY_SCHEMA,
  errors: [],
  nodes: [],
  edges: [],
  positions: {},
  hoveredColumnKey: null,
  loaded: false,

  loadRecord(rec) {
    const result = parseDbml(rec.dbml);
    const schema = result.ok ? result.schema : EMPTY_SCHEMA;
    const errors = result.ok ? [] : result.errors;
    const positions = { ...rec.positions };
    const { nodes, edges } = toFlow(schema, positions);
    // First time loading a schema with no saved layout: lay everything out.
    let finalNodes = nodes;
    if (Object.keys(positions).length === 0 && nodes.length > 0) {
      finalNodes = autoLayout(nodes, edges);
      for (const n of finalNodes) positions[n.id] = n.position;
    } else {
      finalNodes = placeNewTables(nodes, positions);
    }
    set({
      schemaId: rec.id,
      name: rec.name,
      createdAt: rec.createdAt,
      dbml: rec.dbml,
      schema,
      errors,
      nodes: finalNodes,
      edges,
      positions,
      loaded: true,
      hoveredColumnKey: null,
    });
  },

  reset() {
    set({
      schemaId: null,
      name: "Untitled schema",
      createdAt: 0,
      dbml: "",
      schema: EMPTY_SCHEMA,
      errors: [],
      nodes: [],
      edges: [],
      positions: {},
      hoveredColumnKey: null,
      loaded: false,
    });
  },

  setName(name) {
    set({ name });
    void get().persist();
  },

  setDbml(text) {
    const prev = get();
    const result = parseDbml(text);
    if (!result.ok) {
      // Keep previous schema for visual continuity; show errors in editor.
      set({ dbml: text, errors: result.errors });
      void get().persist();
      return;
    }
    const schema = result.schema;

    // Preserve every saved position. New tables get parked to the right of
    // the existing cluster — never re-lays out tables the user has placed.
    const positions = { ...prev.positions };
    const { nodes, edges } = toFlow(schema, positions);
    const finalNodes = placeNewTables(nodes, positions);

    set({
      dbml: text,
      errors: [],
      schema,
      nodes: finalNodes,
      edges,
      positions,
    });
    void get().persist();
  },

  setNodes(updater) {
    const next = updater(get().nodes);
    set({ nodes: next });
  },

  setEdges(updater) {
    const next = updater(get().edges);
    set({ edges: next });
  },

  updatePosition(id, pos) {
    const positions = { ...get().positions, [id]: pos };
    set({ positions });
    void get().persist();
  },

  applyAutoLayout(direction = "LR") {
    const { nodes, edges } = get();
    const laid = autoLayout(nodes, edges, direction);
    const positions: Positions = {};
    for (const n of laid) positions[n.id] = n.position;
    set({ nodes: laid, positions });
    void get().persist();
  },

  setHoveredColumn(key) {
    set({ hoveredColumnKey: key });
  },

  async persist() {
    const s = get();
    if (!s.schemaId) return;
    try {
      await putSchema({
        id: s.schemaId,
        name: s.name,
        dbml: s.dbml,
        positions: s.positions,
        createdAt: s.createdAt || Date.now(),
        updatedAt: Date.now(),
      });
    } catch {
      /* swallow — IndexedDB unavailable in some private modes */
    }
  },
}));
