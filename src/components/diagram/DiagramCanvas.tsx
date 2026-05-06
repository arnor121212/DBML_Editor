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
import { useSchemaStore } from "@/store/schemaStore";
import { pickHeaderColor } from "@/lib/dbml/palette";
import type { TableNodeData } from "@/lib/dbml/toFlow";

const nodeTypes: NodeTypes = { table: TableNode };
const edgeTypes: EdgeTypes = { relation: RelationEdge };

function CanvasInner() {
  const flowRef = useRef<HTMLDivElement>(null);
  const nodes = useSchemaStore((s) => s.nodes);
  const edges = useSchemaStore((s) => s.edges);
  const setNodes = useSchemaStore((s) => s.setNodes);
  const updatePosition = useSchemaStore((s) => s.updatePosition);
  const setHovered = useSchemaStore((s) => s.setHoveredColumn);
  const schemaId = useSchemaStore((s) => s.schemaId);
  const { fitView } = useReactFlow();
  const isEmpty = nodes.length === 0;

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<TableNodeData>>[]) => {
      setNodes((prev) => applyNodeChanges(changes, prev));
      // Persist position only on drag end (no ongoing drags) to keep IDB writes cheap.
      for (const c of changes) {
        if (c.type === "position" && c.dragging === false && c.position) {
          updatePosition(c.id, c.position);
        }
      }
    },
    [setNodes, updatePosition],
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
        nodesDraggable
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
      {isEmpty && <EmptyDiagram />}
    </div>
  );
}

export function DiagramCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
