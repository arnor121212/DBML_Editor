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
import { getActiveBackend, type SchemaRecord } from "@/lib/storage";
import type { MyRole, PublicRole } from "@/lib/storage/types";
import { permissionFor } from "@/lib/sharing/permissions";

interface SchemaState {
  // Identity
  schemaId: string | null;
  name: string;
  createdAt: number;
  ownerId: string | null;
  myRole: MyRole;
  publicRole: PublicRole;
  canEdit: boolean;
  isOwner: boolean;
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
  /** Updated on any content edit; used by the auto-snapshot timer. */
  lastEditAt: number;

  // Actions
  loadRecord: (rec: SchemaRecord) => void;
  reset: () => void;
  setName: (name: string) => void;
  setDbml: (text: string) => void;
  /** Apply DBML text from an external source (collab Y.Text observer). Skips
   *  the lastEditAt bump so we don't immediately auto-snapshot a remote edit
   *  on top of our own. */
  applyExternalDbml: (text: string) => void;
  applyExternalPositions: (positions: Positions) => void;
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
  ownerId: null,
  myRole: null,
  publicRole: "none",
  canEdit: true,
  isOwner: true,
  dbml: "",
  schema: EMPTY_SCHEMA,
  errors: [],
  nodes: [],
  edges: [],
  positions: {},
  hoveredColumnKey: null,
  loaded: false,
  lastEditAt: 0,

  loadRecord(rec) {
    const result = parseDbml(rec.dbml);
    const schema = result.ok ? result.schema : EMPTY_SCHEMA;
    const errors = result.ok ? [] : result.errors;
    const positions = { ...rec.positions };
    const { nodes, edges } = toFlow(schema, positions);
    let finalNodes = nodes;
    if (Object.keys(positions).length === 0 && nodes.length > 0) {
      finalNodes = autoLayout(nodes, edges);
      for (const n of finalNodes) positions[n.id] = n.position;
    } else {
      finalNodes = placeNewTables(nodes, positions);
    }
    const perm = permissionFor(rec);
    set({
      schemaId: rec.id,
      name: rec.name,
      createdAt: rec.createdAt,
      ownerId: rec.ownerId ?? null,
      myRole: rec.myRole ?? null,
      publicRole: rec.publicRole ?? "none",
      canEdit: perm.canEdit,
      isOwner: perm.isOwner,
      dbml: rec.dbml,
      schema,
      errors,
      nodes: finalNodes,
      edges,
      positions,
      loaded: true,
      hoveredColumnKey: null,
      lastEditAt: 0,
    });
  },

  reset() {
    set({
      schemaId: null,
      name: "Untitled schema",
      createdAt: 0,
      ownerId: null,
      myRole: null,
      publicRole: "none",
      canEdit: true,
      isOwner: true,
      dbml: "",
      schema: EMPTY_SCHEMA,
      errors: [],
      nodes: [],
      edges: [],
      positions: {},
      hoveredColumnKey: null,
      loaded: false,
      lastEditAt: 0,
    });
  },

  setName(name) {
    set({ name, lastEditAt: Date.now() });
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
      lastEditAt: Date.now(),
    });
    void get().persist();
  },

  applyExternalDbml(text) {
    const result = parseDbml(text);
    if (!result.ok) {
      set({ dbml: text, errors: result.errors });
      return;
    }
    const positions = { ...get().positions };
    const { nodes, edges } = toFlow(result.schema, positions);
    const finalNodes = placeNewTables(nodes, positions);
    set({
      dbml: text,
      errors: [],
      schema: result.schema,
      nodes: finalNodes,
      edges,
      positions,
    });
    void get().persist();
  },

  applyExternalPositions(positions) {
    const merged = { ...positions };
    const { schema } = get();
    const { nodes, edges } = toFlow(schema, merged);
    set({ positions: merged, nodes, edges });
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
    set({ positions, lastEditAt: Date.now() });
    void get().persist();
  },

  applyAutoLayout(direction = "LR") {
    const { nodes, edges } = get();
    const laid = autoLayout(nodes, edges, direction);
    const positions: Positions = {};
    for (const n of laid) positions[n.id] = n.position;
    set({ nodes: laid, positions, lastEditAt: Date.now() });
    void get().persist();
  },

  setHoveredColumn(key) {
    set({ hoveredColumnKey: key });
  },

  async persist() {
    const s = get();
    if (!s.schemaId) return;
    // Viewers (incl. anonymous public-link viewers, plus signed-in viewers
    // receiving live edits from peers) should never write back. Skip silently.
    if (!s.canEdit) return;
    try {
      await getActiveBackend().put({
        id: s.schemaId,
        name: s.name,
        dbml: s.dbml,
        positions: s.positions,
        createdAt: s.createdAt || Date.now(),
        updatedAt: Date.now(),
      });
    } catch (e) {
      // Swallow per call — toast on every keystroke would be noisy. Log to
      // console so cloud failures aren't completely silent. (IndexedDB also
      // throws here in private-browsing mode; that's expected.)
      // eslint-disable-next-line no-console
      console.warn("[SchemaSync] persist failed:", e);
    }
  },
}));
