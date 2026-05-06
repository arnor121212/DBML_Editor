import { toPng, toSvg } from "html-to-image";
import { getNodesBounds, getViewportForBounds } from "@xyflow/react";
import type { Node } from "@xyflow/react";

interface ExportArgs {
  flowEl: HTMLElement;
  nodes: Node[];
  background?: string;
  pixelRatio?: number;
}

const PADDING = 80;

function viewportTransform(nodes: Node[], width: number, height: number) {
  const bounds = getNodesBounds(nodes);
  return getViewportForBounds(bounds, width, height, 0.5, 2, PADDING);
}

export async function exportPng({
  flowEl,
  nodes,
  background = "transparent",
  pixelRatio = 2,
}: ExportArgs): Promise<string> {
  const viewport = flowEl.querySelector(".react-flow__viewport") as HTMLElement | null;
  if (!viewport) throw new Error("React Flow viewport not found");

  const w = flowEl.clientWidth;
  const h = flowEl.clientHeight;
  const t = viewportTransform(nodes, w, h);

  return toPng(viewport, {
    width: w,
    height: h,
    backgroundColor: background,
    pixelRatio,
    style: {
      width: `${w}px`,
      height: `${h}px`,
      transform: `translate(${t.x}px, ${t.y}px) scale(${t.zoom})`,
    },
    filter: (node) => {
      // Skip the minimap, attribution, controls
      const cls = (node as HTMLElement)?.classList;
      if (!cls) return true;
      if (cls.contains("react-flow__minimap")) return false;
      if (cls.contains("react-flow__controls")) return false;
      if (cls.contains("react-flow__panel")) return false;
      return true;
    },
  });
}

export async function exportSvg({
  flowEl,
  nodes,
  background = "transparent",
}: ExportArgs): Promise<string> {
  const viewport = flowEl.querySelector(".react-flow__viewport") as HTMLElement | null;
  if (!viewport) throw new Error("React Flow viewport not found");

  const w = flowEl.clientWidth;
  const h = flowEl.clientHeight;
  const t = viewportTransform(nodes, w, h);

  return toSvg(viewport, {
    width: w,
    height: h,
    backgroundColor: background,
    style: {
      width: `${w}px`,
      height: `${h}px`,
      transform: `translate(${t.x}px, ${t.y}px) scale(${t.zoom})`,
    },
    filter: (node) => {
      const cls = (node as HTMLElement)?.classList;
      if (!cls) return true;
      if (cls.contains("react-flow__minimap")) return false;
      if (cls.contains("react-flow__controls")) return false;
      if (cls.contains("react-flow__panel")) return false;
      return true;
    },
  });
}

export function downloadDataUrl(filename: string, dataUrl: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
