import type { ReactFlowInstance } from "@xyflow/react";

let instance: ReactFlowInstance | null = null;

export function registerFlow(rf: ReactFlowInstance): void {
  instance = rf;
}

export function unregisterFlow(rf: ReactFlowInstance): void {
  if (instance === rf) instance = null;
}

export function centerOnNode(nodeId: string): boolean {
  if (!instance) return false;
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
