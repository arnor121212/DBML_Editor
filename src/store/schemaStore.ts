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
import {
  computeLineHunks,
  synthesizePreview,
  type HunkStatus,
  type ReviewHunk,
} from "@/lib/dbml/lineDiff";

export interface ReviewState {
  /** The DBML at the moment review started — what we revert to on Discard. */
  baseDbml: string;
  /** Full proposed DBML returned by the model. */
  proposedDbml: string;
  /** Per-hunk decisions (pending/accepted/rejected). */
  hunks: ReviewHunk[];
}

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
  // AI inline review
  review: ReviewState | null;

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
  // Review actions
  startReview: (proposedDbml: string) => boolean;
  setHunkStatus: (id: string, status: HunkStatus) => void;
  setAllHunkStatus: (status: HunkStatus) => void;
  applyReview: () => void;
  discardReview: () => void;
}

const EMPTY_SCHEMA: SchemaModel = { tables: [], refs: [], enums: [] };

/**
 * Parse DBML, build flow nodes/edges, and return a partial state suitable
 * for `set()`. Used by setDbml, setHunkStatus, applyReview, discardReview —
 * anywhere we want to atomically swap the current text and its derived
 * schema/diagram state. On parse error returns just `{ dbml, errors }` so
 * the diagram keeps showing the last good schema.
 */
function buildParsedStatePartial(
  text: string,
  prevPositions: Positions,
): Partial<SchemaState> {
  const result = parseDbml(text);
  if (!result.ok) {
    return { dbml: text, errors: result.errors };
  }
  const positions = { ...prevPositions };
  const { nodes, edges } = toFlow(result.schema, positions);
  const finalNodes = placeNewTables(nodes, edges, positions);
  return {
    dbml: text,
    errors: [],
    schema: result.schema,
    nodes: finalNodes,
    edges,
    positions,
  };
}

/**
 * Place tables that have no saved position, preserving every existing table's
 * position untouched. Two regimes:
 *  - Nothing placed yet (e.g. fresh schema, paste-of-many-tables, AI apply on
 *    an empty doc): run dagre auto-layout so the diagram opens with a real
 *    shape instead of one tall column.
 *  - Some tables already placed: park new arrivals to the right of the
 *    existing cluster — same as before, so manual layouts stay put.
 */
function placeNewTables(
  nodes: Node<TableNodeData>[],
  edges: Edge<RelationEdgeData>[],
  positions: Positions,
): Node<TableNodeData>[] {
  const placed = nodes.filter((n) => positions[n.id]);
  const unplaced = nodes.filter((n) => !positions[n.id]);
  if (unplaced.length === 0) return nodes;

  if (placed.length === 0 && unplaced.length > 1) {
    const laid = autoLayout(nodes, edges);
    for (const n of laid) positions[n.id] = n.position;
    return laid;
  }

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
  review: null,

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
      finalNodes = placeNewTables(nodes, edges, positions);
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
      review: null,
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
      review: null,
    });
  },

  setName(name) {
    set({ name, lastEditAt: Date.now() });
    void get().persist();
  },

  setDbml(text) {
    const prev = get();
    // Any direct write to dbml ends an active review. The synthesized preview
    // text passed back through here from applyReview already has review === null
    // (applyReview clears it before calling), so this only fires on manual edits.
    const reviewWasActive = prev.review !== null;
    const partial = buildParsedStatePartial(text, prev.positions);
    set({
      ...partial,
      lastEditAt: Date.now(),
      ...(reviewWasActive ? { review: null } : null),
    });
    void get().persist();
  },

  applyExternalDbml(text) {
    const prev = get();
    const partial = buildParsedStatePartial(text, prev.positions);
    set(partial);
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

  startReview(proposedDbml) {
    const baseDbml = get().dbml;
    const rawHunks = computeLineHunks(baseDbml, proposedDbml);
    if (rawHunks.length === 0) return false;
    const hunks: ReviewHunk[] = rawHunks.map((h) => ({
      ...h,
      status: "pending",
    }));
    set({ review: { baseDbml, proposedDbml, hunks } });
    return true;
  },

  setHunkStatus(id, status) {
    const prev = get();
    const review = prev.review;
    if (!review) return;
    const hunks = review.hunks.map((h) =>
      h.id === id ? { ...h, status } : h,
    );
    const newReview = { ...review, hunks };
    // "applied" mode → pending hunks contribute *original* lines; only
    // accepted ones land in the diagram. Pending changes only become visible
    // in dbml/diagram when the user actually accepts them.
    const { text } = synthesizePreview(review.baseDbml, hunks, "applied");

    if (text === prev.dbml) {
      set({ review: newReview });
      return;
    }

    const partial = buildParsedStatePartial(text, prev.positions);
    set({ review: newReview, ...partial });
    void get().persist();
  },

  setAllHunkStatus(status) {
    const prev = get();
    const review = prev.review;
    if (!review) return;
    const hunks = review.hunks.map((h) => ({ ...h, status }));
    const newReview = { ...review, hunks };
    const { text } = synthesizePreview(review.baseDbml, hunks, "applied");

    if (text === prev.dbml) {
      set({ review: newReview });
      return;
    }
    const partial = buildParsedStatePartial(text, prev.positions);
    set({ review: newReview, ...partial });
    void get().persist();
  },

  applyReview() {
    const prev = get();
    const review = prev.review;
    if (!review) return;
    // Pending hunks default to "accepted" — clicking Apply with anything still
    // pending means the user chose to keep the proposal as-is for those bits.
    const decided: ReviewHunk[] = review.hunks.map((h) =>
      h.status === "pending" ? { ...h, status: "accepted" } : h,
    );
    const { text } = synthesizePreview(review.baseDbml, decided, "applied");

    // dbml may already be in sync (incremental hunk decisions kept it current).
    if (text === prev.dbml) {
      set({ review: null });
      return;
    }
    const partial = buildParsedStatePartial(text, prev.positions);
    set({ review: null, ...partial });
    void get().persist();
  },

  discardReview() {
    const prev = get();
    const review = prev.review;
    if (!review) return;
    if (review.baseDbml === prev.dbml) {
      set({ review: null });
      return;
    }
    const partial = buildParsedStatePartial(review.baseDbml, prev.positions);
    set({ review: null, ...partial });
    void get().persist();
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
