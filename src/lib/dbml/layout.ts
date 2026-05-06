import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";
import type { TableNodeData } from "./toFlow";

const DEFAULT_NODE_WIDTH = 280;
const HEADER_HEIGHT = 44;
const ROW_HEIGHT = 28;
const PADDING_BOTTOM = 12;

function estimateNodeHeight(node: Node<TableNodeData>): number {
  const cols = node.data.columns?.length ?? 0;
  return HEADER_HEIGHT + cols * ROW_HEIGHT + PADDING_BOTTOM;
}

export function autoLayout(
  nodes: Node<TableNodeData>[],
  edges: Edge[],
  direction: "LR" | "TB" = "LR",
): Node<TableNodeData>[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 120,
    edgesep: 30,
    marginx: 40,
    marginy: 40,
  });

  for (const n of nodes) {
    g.setNode(n.id, {
      width: DEFAULT_NODE_WIDTH,
      height: estimateNodeHeight(n),
    });
  }
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    if (!pos) return n;
    return {
      ...n,
      position: {
        x: pos.x - DEFAULT_NODE_WIDTH / 2,
        y: pos.y - estimateNodeHeight(n) / 2,
      },
    };
  });
}
