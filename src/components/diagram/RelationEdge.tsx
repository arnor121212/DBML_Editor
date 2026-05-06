import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import type { RelationEdgeData } from "@/lib/dbml/toFlow";
import { useSchemaStore } from "@/store/schemaStore";
import { cn } from "@/lib/utils";

function getMarkerForKind(kind: RelationEdgeData["kind"]): {
  startMarker: string;
  endMarker: string;
} {
  switch (kind) {
    case "one-to-one":
      return { startMarker: "url(#cf-one-start)", endMarker: "url(#cf-one-end)" };
    case "one-to-many":
      return {
        startMarker: "url(#cf-one-start)",
        endMarker: "url(#cf-many-end)",
      };
    case "many-to-one":
      return {
        startMarker: "url(#cf-many-start)",
        endMarker: "url(#cf-one-end)",
      };
    case "many-to-many":
      return {
        startMarker: "url(#cf-many-start)",
        endMarker: "url(#cf-many-end)",
      };
  }
}

function RelationEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  source,
  target,
  sourceHandleId,
  targetHandleId,
}: EdgeProps & { data?: RelationEdgeData }) {
  const hovered = useSchemaStore((s) => s.hoveredColumnKey);

  // Smooth step path with rounded corners reads as "schema-like" much better
  // than a plain bezier — it stays orthogonal to the table edges.
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 14,
  });

  const kind = data?.kind ?? "many-to-one";
  const { startMarker, endMarker } = getMarkerForKind(kind);

  const isHighlighted =
    !!hovered &&
    (() => {
      const [hTable, hCol] = hovered.split("::");
      const sCol = sourceHandleId?.split(".")[0];
      const tCol = targetHandleId?.split(".")[0];
      return (
        (hTable === source && hCol === sCol) ||
        (hTable === target && hCol === tCol)
      );
    })();

  const isDimmed = !!hovered && !isHighlighted;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerStart={startMarker}
        markerEnd={endMarker}
        className={cn(
          isHighlighted && "is-highlighted",
          isDimmed && "is-dimmed",
        )}
        style={{
          color: isHighlighted
            ? "var(--color-primary)"
            : "color-mix(in oklab, var(--color-muted-foreground) 70%, transparent)",
        }}
      />
      {isHighlighted && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded border border-primary/40 bg-popover px-1.5 py-0.5 text-[10px] font-medium text-primary shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2}px)`,
            }}
          >
            {kindLabel(kind)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function kindLabel(kind: RelationEdgeData["kind"]): string {
  switch (kind) {
    case "one-to-one":
      return "1—1";
    case "one-to-many":
      return "1—N";
    case "many-to-one":
      return "N—1";
    case "many-to-many":
      return "N—N";
  }
}

export const RelationEdge = memo(RelationEdgeInner);
