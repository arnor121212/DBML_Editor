/**
 * Hidden SVG defs with crow's-foot marker definitions, referenced from
 * RelationEdge via `marker-start` / `marker-end`. Mounted once at the
 * root of the diagram canvas so all edges can reference them.
 *
 * Marker convention:
 *   #cf-many-end / #cf-one-end       — markers at the edge's terminal
 *   #cf-many-start / #cf-one-start   — markers at the edge's origin (mirrored)
 */
export function EdgeMarkers() {
  return (
    <svg
      width={0}
      height={0}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      aria-hidden
    >
      <defs>
        {/* "many" — crow's foot (three diverging lines) */}
        <marker
          id="cf-many-end"
          viewBox="0 0 14 14"
          refX="13"
          refY="7"
          markerUnits="userSpaceOnUse"
          markerWidth={14}
          markerHeight={14}
          orient="auto-start-reverse"
        >
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
          >
            <path d="M13 7 L4 1.5" />
            <path d="M13 7 L4 7" />
            <path d="M13 7 L4 12.5" />
          </g>
        </marker>
        <marker
          id="cf-many-start"
          viewBox="0 0 14 14"
          refX="1"
          refY="7"
          markerUnits="userSpaceOnUse"
          markerWidth={14}
          markerHeight={14}
          orient="auto"
        >
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
          >
            <path d="M1 7 L10 1.5" />
            <path d="M1 7 L10 7" />
            <path d="M1 7 L10 12.5" />
          </g>
        </marker>

        {/* "one" — single perpendicular tick */}
        <marker
          id="cf-one-end"
          viewBox="0 0 14 14"
          refX="11"
          refY="7"
          markerUnits="userSpaceOnUse"
          markerWidth={14}
          markerHeight={14}
          orient="auto-start-reverse"
        >
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
          >
            <path d="M9 2 L9 12" />
          </g>
        </marker>
        <marker
          id="cf-one-start"
          viewBox="0 0 14 14"
          refX="3"
          refY="7"
          markerUnits="userSpaceOnUse"
          markerWidth={14}
          markerHeight={14}
          orient="auto"
        >
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
          >
            <path d="M5 2 L5 12" />
          </g>
        </marker>
      </defs>
    </svg>
  );
}
