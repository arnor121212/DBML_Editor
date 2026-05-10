import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
  type NodeMouseHandler,
} from "@xyflow/react";
import { TableNode } from "./TableNode";
import { RelationEdge } from "./RelationEdge";
import { DiagramToolbar } from "./DiagramToolbar";
import { EmptyDiagram } from "./EmptyDiagram";
import { EdgeMarkers } from "./EdgeMarkers";
import { LintPanel } from "./LintPanel";
import { RemoteCursors } from "@/components/collab/RemoteCursors";
import { useSchemaStore } from "@/store/schemaStore";
import { pickHeaderColor } from "@/lib/dbml/palette";
import { findTableLine } from "@/lib/dbml/findTableLine";
import { hasEditor, revealLine } from "@/lib/editor/editorBus";
import { registerFlow, unregisterFlow } from "@/lib/commands/diagramBus";
import type { RelationEdgeData, TableNodeData } from "@/lib/dbml/toFlow";
import type { PresencePeer } from "@/lib/collab/usePresence";

const nodeTypes: NodeTypes = { table: TableNode };
const edgeTypes: EdgeTypes = { relation: RelationEdge };

interface CanvasProps {
  peers?: PresencePeer[];
  onCursorMove?: (pos: { x: number; y: number } | null) => void;
  /** Called when the user clicks a table; lets the parent open the editor
   *  panel if it's currently hidden. The cursor jump is performed via
   *  `editorBus.revealLine` and only works when the editor is mounted. */
  onRequestEditorOpen?: () => void;
}

function CanvasInner({ peers, onCursorMove, onRequestEditorOpen }: CanvasProps) {
  const flowRef = useRef<HTMLDivElement>(null);
  const nodes = useSchemaStore((s) => s.nodes);
  const edges = useSchemaStore((s) => s.edges);
  const setNodes = useSchemaStore((s) => s.setNodes);
  const setEdges = useSchemaStore((s) => s.setEdges);
  const updatePosition = useSchemaStore((s) => s.updatePosition);
  const deleteTables = useSchemaStore((s) => s.deleteTables);
  const duplicateTables = useSchemaStore((s) => s.duplicateTables);
  const addRef = useSchemaStore((s) => s.addRef);
  const deleteRef = useSchemaStore((s) => s.deleteRef);
  const updateRef = useSchemaStore((s) => s.updateRef);
  const setHovered = useSchemaStore((s) => s.setHoveredColumn);
  const schemaId = useSchemaStore((s) => s.schemaId);
  const canEdit = useSchemaStore((s) => s.canEdit);
  const reactFlow = useReactFlow();
  const { fitView, screenToFlowPosition } = reactFlow;
  const isEmpty = nodes.length === 0;

  // Make the React Flow instance available to commands fired from outside
  // the canvas tree (e.g. the Cmd+K palette's "go to table" actions).
  useEffect(() => {
    registerFlow(reactFlow);
    return () => unregisterFlow(reactFlow);
  }, [reactFlow]);

  // Track local mouse over the canvas in flow coords. Attached to flowRef
  // (a sibling of React Flow's pane), not as an overlay, so React Flow's
  // own event handling — drag, hover, scroll — keeps working.
  useEffect(() => {
    if (!onCursorMove || !flowRef.current) return;
    const el = flowRef.current;
    const onMove = (e: MouseEvent) => {
      onCursorMove(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    };
    const onLeave = () => onCursorMove(null);
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [onCursorMove, screenToFlowPosition]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<TableNodeData>>[]) => {
      const removes: string[] = [];
      const other: NodeChange<Node<TableNodeData>>[] = [];
      for (const c of changes) {
        if (c.type === "remove") {
          removes.push(c.id);
        } else {
          other.push(c);
        }
      }

      if (other.length > 0) {
        setNodes((prev) => applyNodeChanges(other, prev));
      }

      // Persist position only on drag end (no ongoing drags) to keep IDB writes cheap.
      for (const c of changes) {
        if (c.type === "position" && c.dragging === false && c.position) {
          updatePosition(c.id, c.position);
        }
      }

      // Route node removals through the store so the DBML text is updated.
      if (removes.length > 0) {
        deleteTables(removes);
      }
    },
    [setNodes, updatePosition, deleteTables],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge<RelationEdgeData>>[]) => {
      setEdges((prev) => applyEdgeChanges(changes, prev));
    },
    [setEdges],
  );

  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHovered(null);
  }, [setHovered]);

  /** Jump the editor's cursor to the table's `Table <id>` line. If the
   *  editor side-panel is closed, ask the parent to open it; the bus
   *  queues the reveal and replays it when the editor mounts. */
  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      const dbml = useSchemaStore.getState().dbml;
      const line = findTableLine(dbml, node.id);
      if (line === null) return;
      if (!hasEditor() && onRequestEditorOpen) onRequestEditorOpen();
      revealLine(line);
    },
    [onRequestEditorOpen],
  );

  /** Parse a handle id (`${col}.${type}.${side}`) into its column + side. */
  const parseHandle = useCallback(
    (h: string | null | undefined): { col: string; side: "l" | "r" } | null => {
      if (!h) return null;
      const m = h.match(/^(.+)\.(?:source|target)\.([lr])$/);
      return m ? { col: m[1], side: m[2] as "l" | "r" } : null;
    },
    [],
  );

  /** User dragged a connection between two column handles. Translate it
   *  into a `Ref:` line at the end of the DBML. */
  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      const src = parseHandle(conn.sourceHandle);
      const tgt = parseHandle(conn.targetHandle);
      if (!src || !tgt) return;
      addRef(
        { tableId: conn.source, column: src.col, side: src.side },
        { tableId: conn.target, column: tgt.col, side: tgt.side },
      );
    },
    [addRef, parseHandle],
  );

  /** User pressed Delete on selected edges. Map each back to its source/
   *  target columns and remove the corresponding `Ref:` from the DBML. */
  const onEdgesDelete = useCallback(
    (edgesToDelete: Edge[]) => {
      for (const e of edgesToDelete) {
        const src = parseHandle(e.sourceHandle);
        const tgt = parseHandle(e.targetHandle);
        if (!src || !tgt || !e.source || !e.target) continue;
        deleteRef(
          { tableId: e.source, column: src.col },
          { tableId: e.target, column: tgt.col },
        );
      }
    },
    [deleteRef, parseHandle],
  );

  /** User dragged an existing edge endpoint to a new handle. */
  const onReconnect = useCallback(
    (oldEdge: Edge, newConn: Connection) => {
      const oldSrc = parseHandle(oldEdge.sourceHandle);
      const oldTgt = parseHandle(oldEdge.targetHandle);
      const newSrc = parseHandle(newConn.sourceHandle);
      const newTgt = parseHandle(newConn.targetHandle);
      if (!oldSrc || !oldTgt || !newSrc || !newTgt) return;
      if (!oldEdge.source || !oldEdge.target) return;
      if (!newConn.source || !newConn.target) return;
      updateRef(
        {
          source: { tableId: oldEdge.source, column: oldSrc.col },
          target: { tableId: oldEdge.target, column: oldTgt.col },
        },
        {
          source: { tableId: newConn.source, column: newSrc.col, side: newSrc.side },
          target: { tableId: newConn.target, column: newTgt.col, side: newTgt.side },
        },
      );
    },
    [updateRef, parseHandle],
  );

  /** Ctrl+C / Ctrl+V on the canvas duplicates selected tables. We listen at
   *  document level but bail when focus is inside a text input or Monaco —
   *  otherwise normal text-copy/paste in the editor would also trigger
   *  table duplication. */
  const clipboardRef = useRef<string[]>([]);
  useEffect(() => {
    if (!canEdit) return;
    function isFormControl(el: Element | null): boolean {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return true;
      // Monaco's content host has role="textbox" and contenteditable.
      if (el.getAttribute("role") === "textbox") return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== "c" && e.key !== "C" && e.key !== "v" && e.key !== "V") return;
      if (isFormControl(document.activeElement)) return;

      const isCopy = e.key === "c" || e.key === "C";
      if (isCopy) {
        const selectedIds = useSchemaStore
          .getState()
          .nodes.filter((n) => n.selected)
          .map((n) => n.id);
        if (selectedIds.length === 0) return;
        clipboardRef.current = selectedIds;
        e.preventDefault();
      } else {
        if (clipboardRef.current.length === 0) return;
        // Filter out ids that no longer exist (e.g. user deleted the source
        // since the last copy). Without this, paste would silently no-op.
        const liveIds = useSchemaStore
          .getState()
          .schema.tables.map((t) => t.id);
        const liveSet = new Set(liveIds);
        const validSources = clipboardRef.current.filter((id) => liveSet.has(id));
        if (validSources.length === 0) return;
        const newIds = duplicateTables(validSources);
        if (newIds.length === 0) return;
        e.preventDefault();
        // Clipboard stays pointed at the original sources — repeat-pasting
        // creates `users_copy`, `users_copy_2`, … instead of cycling through
        // copies.
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canEdit, duplicateTables]);

  const minimapNodeColor = useCallback(
    (node: Node<TableNodeData>) => pickHeaderColor(node.data?.name ?? node.id),
    [],
  );

  // Fit to view once per schema load — never on every keystroke.
  const didFitRef = useRef<string | null>(null);
  useEffect(() => {
    if (!schemaId || nodes.length === 0) return;
    if (didFitRef.current === schemaId) return;
    didFitRef.current = schemaId;
    // Defer to next frame so React Flow has measured nodes.
    const id = requestAnimationFrame(() =>
      fitView({ padding: 0.2, duration: 400 }),
    );
    return () => cancelAnimationFrame(id);
  }, [schemaId, nodes, fitView]);

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  return (
    <div ref={flowRef} className="relative h-full w-full">
      <EdgeMarkers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeMouseLeave={onNodeMouseLeave}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onReconnect={onReconnect}
        edgesReconnectable={canEdit}
        proOptions={proOptions}
        minZoom={0.2}
        maxZoom={2}
        deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        connectionMode={ConnectionMode.Loose}
        elementsSelectable
        selectNodesOnDrag={false}
        defaultEdgeOptions={{ type: "relation" }}
        panOnScroll
        zoomOnPinch
        elevateEdgesOnSelect
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="color-mix(in oklab, var(--color-border) 90%, transparent)"
        />
        <Controls
          position="bottom-left"
          showInteractive={false}
          showFitView
          showZoom
          className="!shadow-lg"
        />
        <MiniMap
          position="bottom-right"
          zoomable
          pannable
          nodeColor={minimapNodeColor}
          nodeStrokeWidth={2}
          maskColor="color-mix(in oklab, var(--color-background) 80%, transparent)"
        />
        <Panel position="top-left">
          <LintPanel onRequestEditorOpen={onRequestEditorOpen} />
        </Panel>
        <Panel position="top-right">
          <DiagramToolbar flowRef={flowRef} />
        </Panel>
      </ReactFlow>
      {peers && <RemoteCursors peers={peers} />}
      {isEmpty && <EmptyDiagram />}
    </div>
  );
}

export function DiagramCanvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
