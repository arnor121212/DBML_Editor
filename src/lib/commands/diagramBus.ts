/**
 * Module-scoped registry holding the active React Flow instance so
 * components outside the `<ReactFlowProvider>` tree (the command palette
 * lives in SchemaEditor's header / portal layer) can drive the canvas.
 *
 * Mirrors editorBus exactly. DiagramCanvas registers on mount; consumers
 * call `centerOnNode(id)` to animate the viewport onto a specific table.
 */
import type { ReactFlowInstance } from "@xyflow/react";

let instance: ReactFlowInstance | null = null;

export function registerFlow(rf: ReactFlowInstance): void {
  instance = rf;
}

export function unregisterFlow(rf: ReactFlowInstance): void {
  if (instance === rf) instance = null;
}

/**
 * Animate the viewport onto a single node. Returns false if no diagram
 * is mounted (e.g. the route is loading) or the node id isn't found —
 * the caller can fall through to its own no-op.
 */
export function centerOnNode(nodeId: string): boolean {
  if (!instance) return false;
  // `fitView` with a node filter is the React Flow v12 path for
  // centering on one node — handles padding + zoom for us. Returns
  // a promise; we don't await since the animation runs visually.
  void instance.fitView({
    nodes: [{ id: nodeId }],
    duration: 400,
    padding: 0.4,
    maxZoom: 1.2,
  });
  return true;
}

export function hasDiagram(): boolean {
  return instance !== null;
}
