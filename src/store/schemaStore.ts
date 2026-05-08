import { create } from "zustand";
import type { Edge, Node } from "@xyflow/react";
import type { ParseError, SchemaModel } from "@/lib/dbml/types";
import { parseDbml } from "@/lib/dbml/parse";
import {
  toFlow,
  edgeSideKey,
  type EdgeSide,
  type EdgeSides,
  type Positions,
  type RelationEdgeData,
  type TableNodeData,
  type Widths,
} from "@/lib/dbml/toFlow";
import { autoLayout } from "@/lib/dbml/layout";
import { removeTables } from "@/lib/dbml/removeTable";
import { renameTable as renameTableText } from "@/lib/dbml/renameTable";
import { duplicateTableBlocks, nextAvailableName } from "@/lib/dbml/copyTable";
import { appendRef } from "@/lib/dbml/addRef";
import { removeRef } from "@/lib/dbml/removeRef";
import {
  replaceText as editorReplaceText,
  revealLine as editorRevealLine,
} from "@/lib/editor/editorBus";
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
  widths: Widths;
  edgeSides: EdgeSides;
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
  deleteTables: (tableIds: string[]) => void;
  /** Rename a table by id; rewrites declaration + every ref that points at
   *  it. Returns true on success, false if the new name conflicts or is
   *  invalid. */
  renameTable: (tableId: string, newName: string) => boolean;
  /** Per-table width override (visual only — doesn't bump lastEditAt). */
  setWidth: (tableId: string, width: number) => void;
  /** Duplicate one or more tables. Pasted nodes land offset from the
   *  originals; new ids are returned so the caller can update selection. */
  duplicateTables: (tableIds: string[]) => string[];
  /** Add a `Ref:` line for a connection drawn between two columns. The
   *  sides record which edges of the tables the drag started/ended on
   *  so the rendered arrow follows the drag direction. */
  addRef: (
    source: { tableId: string; column: string; side: EdgeSide },
    target: { tableId: string; column: string; side: EdgeSide },
  ) => void;
  /** Remove the `Ref:` (or matching inline ref) connecting two columns. */
  deleteRef: (
    source: { tableId: string; column: string },
    target: { tableId: string; column: string },
  ) => void;
  /** Move an existing relationship: relocate one or both endpoints. If
   *  only the sides changed (same columns), only `edgeSides` is updated.
   *  If a column or table changed, the DBML is rewritten. */
  updateRef: (
    oldEnds: {
      source: { tableId: string; column: string };
      target: { tableId: string; column: string };
    },
    newEnds: {
      source: { tableId: string; column: string; side: EdgeSide };
      target: { tableId: string; column: string; side: EdgeSide };
    },
  ) => void;
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
  prevWidths: Widths,
  prevEdgeSides: EdgeSides,
): Partial<SchemaState> {
  const result = parseDbml(text);
  if (!result.ok) {
    return { dbml: text, errors: result.errors };
  }
  const positions = { ...prevPositions };
  const { nodes, edges } = toFlow(
    result.schema,
    positions,
    prevWidths,
    prevEdgeSides,
  );
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
  widths: {},
  edgeSides: {},
  hoveredColumnKey: null,
  loaded: false,
  lastEditAt: 0,
  review: null,

  loadRecord(rec) {
    const result = parseDbml(rec.dbml);
    const schema = result.ok ? result.schema : EMPTY_SCHEMA;
    const errors = result.ok ? [] : result.errors;
    const positions = { ...rec.positions };
    const widths = { ...(rec.widths ?? {}) };
    const edgeSides = { ...(rec.edgeSides ?? {}) };
    const { nodes, edges } = toFlow(schema, positions, widths, edgeSides);
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
      widths,
      edgeSides,
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
      widths: {},
      edgeSides: {},
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
    const partial = buildParsedStatePartial(text, prev.positions, prev.widths, prev.edgeSides);
    set({
      ...partial,
      lastEditAt: Date.now(),
      ...(reviewWasActive ? { review: null } : null),
    });
    void get().persist();
  },

  deleteTables(tableIds) {
    const prev = get();
    if (!prev.canEdit || tableIds.length === 0) return;

    const newDbml = removeTables(prev.dbml, new Set(tableIds));
    if (newDbml === prev.dbml) return;

    // Try to push the change through Monaco so it lands on the editor's
    // undo stack — Ctrl+Z then restores the deleted table.
    // Positions are intentionally *not* cleared so an undo restores the
    // table to its original spot.
    if (editorReplaceText(newDbml)) {
      // The editor's onChange → debouncedSet → setDbml pipeline rebuilds
      // schema/nodes/edges. Nothing else to do here.
      return;
    }

    // Editor not mounted (e.g. side-panel closed) — fall back to direct
    // store mutation. Undo isn't available in this path, so prune the
    // deleted tables' positions; otherwise re-creating a table with the
    // same name would inherit the stale spot.
    const positions = { ...prev.positions };
    for (const id of tableIds) delete positions[id];
    const reviewWasActive = prev.review !== null;
    const partial = buildParsedStatePartial(newDbml, positions, prev.widths, prev.edgeSides);
    set({
      ...partial,
      lastEditAt: Date.now(),
      ...(reviewWasActive ? { review: null } : null),
    });
    void get().persist();
  },

  renameTable(tableId, rawNewName) {
    const prev = get();
    if (!prev.canEdit) return false;
    const newName = rawNewName.trim();
    if (!newName) return false;
    const dot = tableId.indexOf(".");
    const oldSchema = dot >= 0 ? tableId.slice(0, dot) : "public";
    const oldName = dot >= 0 ? tableId.slice(dot + 1) : tableId;
    if (oldName === newName) return false;
    // Conflict check: refuse if a table with the same id already exists.
    const newId = `${oldSchema}.${newName}`;
    if (prev.schema.tables.some((t) => t.id === newId)) return false;

    const newDbml = renameTableText(prev.dbml, tableId, newName);
    if (newDbml === prev.dbml) return false;

    // Migrate positions/widths to the new id so the table doesn't jump.
    const positions = { ...prev.positions };
    const widths = { ...prev.widths };
    if (positions[tableId]) {
      positions[newId] = positions[tableId];
      delete positions[tableId];
    }
    if (widths[tableId] !== undefined) {
      widths[newId] = widths[tableId];
      delete widths[tableId];
    }

    // Rebuild schema/nodes/edges synchronously regardless of which path
    // we take. The editor path *also* triggers a deferred setDbml via
    // Monaco's onChange → debouncedSet; that re-runs buildParsedStatePartial
    // but is idempotent (same DBML, same positions/widths). Doing it
    // synchronously closes a 180ms window where the diagram still shows
    // the old node id — if the user dragged the just-renamed node in that
    // window, updatePosition would write back under the stale id.
    const partial = buildParsedStatePartial(newDbml, positions, widths, get().edgeSides);
    if (editorReplaceText(newDbml)) {
      set({ ...partial, positions, widths, lastEditAt: Date.now() });
      return true;
    }
    set({ ...partial, positions, widths, lastEditAt: Date.now() });
    void get().persist();
    return true;
  },

  setWidth(tableId, width) {
    const prev = get();
    if (!prev.canEdit) return;
    const widths = { ...prev.widths, [tableId]: Math.round(width) };
    // Update the matching node's style in place so React Flow picks it up
    // without a full schema rebuild.
    const nodes = prev.nodes.map((n) =>
      n.id === tableId
        ? { ...n, style: { ...(n.style ?? {}), width: Math.round(width) } }
        : n,
    );
    set({ widths, nodes });
    void get().persist();
  },

  duplicateTables(tableIds) {
    const prev = get();
    if (!prev.canEdit || tableIds.length === 0) return [];
    // Refuse to paste while the DBML can't parse — `findTableBlock` is run
    // against the broken source text and would silently fail to locate the
    // requested ids. Without this guard the user would see no feedback.
    if (prev.errors.length > 0) return [];

    // Compute fresh names + the resulting source→new id map.
    const existingIds = new Set(prev.schema.tables.map((t) => t.id));
    const specs: { sourceId: string; newName: string }[] = [];
    const oldToNew: Record<string, string> = {};
    for (const id of tableIds) {
      const tbl = prev.schema.tables.find((t) => t.id === id);
      if (!tbl) continue;
      const newName = nextAvailableName(tbl.name, tbl.schema, existingIds);
      const newId = `${tbl.schema || "public"}.${newName}`;
      existingIds.add(newId); // so later items in the same paste don't collide
      oldToNew[id] = newId;
      specs.push({ sourceId: id, newName });
    }
    if (specs.length === 0) return [];

    const { text: newDbml, newTableIds } = duplicateTableBlocks(prev.dbml, specs);
    if (newDbml === prev.dbml) return [];

    // Place each pasted node 40px right + down of its source.
    const positions = { ...prev.positions };
    const widths = { ...prev.widths };
    for (const oldId of Object.keys(oldToNew)) {
      const newId = oldToNew[oldId];
      const src = positions[oldId];
      if (src) positions[newId] = { x: src.x + 40, y: src.y + 40 };
      if (widths[oldId] !== undefined) widths[newId] = widths[oldId];
    }

    const partial = buildParsedStatePartial(newDbml, positions, widths, get().edgeSides);
    if (editorReplaceText(newDbml)) {
      set({ ...partial, positions, widths, lastEditAt: Date.now() });
      return newTableIds;
    }
    set({ ...partial, positions, widths, lastEditAt: Date.now() });
    void get().persist();
    return newTableIds;
  },

  addRef(source, target) {
    const prev = get();
    if (!prev.canEdit) return;
    const { text: newDbml, line } = appendRef(prev.dbml, source, target);
    // Persist which sides the user dragged from/to so the rendered edge
    // mirrors the drag direction even after the DBML round-trip.
    const sideKey = edgeSideKey(
      source.tableId,
      source.column,
      target.tableId,
      target.column,
    );
    const edgeSides: EdgeSides = {
      ...prev.edgeSides,
      [sideKey]: { srcSide: source.side, tgtSide: target.side },
    };
    if (newDbml === prev.dbml) {
      // Already exists — just update the side preference and reveal.
      const partial = buildParsedStatePartial(
        prev.dbml,
        prev.positions,
        prev.widths,
        edgeSides,
      );
      set({ ...partial, edgeSides });
      editorRevealLine(line);
      void get().persist();
      return;
    }
    const partial = buildParsedStatePartial(newDbml, prev.positions, prev.widths, edgeSides);
    if (editorReplaceText(newDbml)) {
      set({ ...partial, edgeSides, lastEditAt: Date.now() });
      editorRevealLine(line);
      return;
    }
    set({ ...partial, edgeSides, lastEditAt: Date.now() });
    void get().persist();
  },

  deleteRef(source, target) {
    const prev = get();
    if (!prev.canEdit) return;
    const newDbml = removeRef(prev.dbml, source, target);
    if (newDbml === prev.dbml) return;
    const edgeSides = { ...prev.edgeSides };
    delete edgeSides[
      edgeSideKey(source.tableId, source.column, target.tableId, target.column)
    ];
    const partial = buildParsedStatePartial(
      newDbml,
      prev.positions,
      prev.widths,
      edgeSides,
    );
    if (editorReplaceText(newDbml)) {
      set({ ...partial, edgeSides, lastEditAt: Date.now() });
      return;
    }
    set({ ...partial, edgeSides, lastEditAt: Date.now() });
    void get().persist();
  },

  updateRef(oldEnds, newEnds) {
    const prev = get();
    if (!prev.canEdit) return;
    const sameEndpoints =
      oldEnds.source.tableId === newEnds.source.tableId &&
      oldEnds.source.column === newEnds.source.column &&
      oldEnds.target.tableId === newEnds.target.tableId &&
      oldEnds.target.column === newEnds.target.column;

    const newSideKey = edgeSideKey(
      newEnds.source.tableId,
      newEnds.source.column,
      newEnds.target.tableId,
      newEnds.target.column,
    );

    if (sameEndpoints) {
      // Only the sides changed — pure visual update, no DBML rewrite.
      const edgeSides: EdgeSides = {
        ...prev.edgeSides,
        [newSideKey]: {
          srcSide: newEnds.source.side,
          tgtSide: newEnds.target.side,
        },
      };
      const partial = buildParsedStatePartial(
        prev.dbml,
        prev.positions,
        prev.widths,
        edgeSides,
      );
      set({ ...partial, edgeSides });
      void get().persist();
      return;
    }

    // Endpoint changed: remove old + append new in one Monaco edit.
    const removed = removeRef(prev.dbml, oldEnds.source, oldEnds.target);
    const { text: newDbml } = appendRef(removed, newEnds.source, newEnds.target);
    const oldSideKey = edgeSideKey(
      oldEnds.source.tableId,
      oldEnds.source.column,
      oldEnds.target.tableId,
      oldEnds.target.column,
    );
    const edgeSides: EdgeSides = { ...prev.edgeSides };
    delete edgeSides[oldSideKey];
    edgeSides[newSideKey] = {
      srcSide: newEnds.source.side,
      tgtSide: newEnds.target.side,
    };
    const partial = buildParsedStatePartial(
      newDbml,
      prev.positions,
      prev.widths,
      edgeSides,
    );
    if (editorReplaceText(newDbml)) {
      set({ ...partial, edgeSides, lastEditAt: Date.now() });
      return;
    }
    set({ ...partial, edgeSides, lastEditAt: Date.now() });
    void get().persist();
  },

  applyExternalDbml(text) {
    const prev = get();
    const partial = buildParsedStatePartial(text, prev.positions, prev.widths, prev.edgeSides);
    set(partial);
    void get().persist();
  },

  applyExternalPositions(positions) {
    const merged = { ...positions };
    const { schema, widths, edgeSides } = get();
    const { nodes, edges } = toFlow(schema, merged, widths, edgeSides);
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

    const partial = buildParsedStatePartial(text, prev.positions, prev.widths, prev.edgeSides);
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
    const partial = buildParsedStatePartial(text, prev.positions, prev.widths, prev.edgeSides);
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
    const partial = buildParsedStatePartial(text, prev.positions, prev.widths, prev.edgeSides);
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
    const partial = buildParsedStatePartial(
      review.baseDbml,
      prev.positions,
      prev.widths,
      prev.edgeSides,
    );
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
        widths: s.widths,
        edgeSides: s.edgeSides,
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
