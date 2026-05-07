import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
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
import { RemoteCursors } from "@/components/collab/RemoteCursors";
import { useSchemaStore } from "@/store/schemaStore";
import { pickHeaderColor } from "@/lib/dbml/palette";
import type { TableNodeData } from "@/lib/dbml/toFlow";
import type { PresencePeer } from "@/lib/collab/usePresence";

const nodeTypes: NodeTypes = { table: TableNode };
const edgeTypes: EdgeTypes = { relation: RelationEdge };

interface CanvasProps {
  peers?: PresencePeer[];
  onCursorMove?: (pos: { x: number; y: number } | null) => void;
}

function CanvasInner({ peers, onCursorMove }: CanvasProps) {
  const flowRef = useRef<HTMLDivElement>(null);
  const nodes = useSchemaStore((s) => s.nodes);
  const edges = useSchemaStore((s) => s.edges);
  const setNodes = useSchemaStore((s) => s.setNodes);
  const updatePosition = useSchemaStore((s) => s.updatePosition);
  const deleteTables = useSchemaStore((s) => s.deleteTables);
  const setHovered = useSchemaStore((s) => s.setHoveredColumn);
  const schemaId = useSchemaStore((s) => s.schemaId);
  const canEdit = useSchemaStore((s) => s.canEdit);
  const { fitView, screenToFlowPosition } = useReactFlow();
  const isEmpty = nodes.length === 0;

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

  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHovered(null);
  }, [setHovered]);

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
        onNodeMouseLeave={onNodeMouseLeave}
        proOptions={proOptions}
        minZoom={0.2}
        maxZoom={2}
        deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
        nodesDraggable={canEdit}
        nodesConnectable={false}
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
