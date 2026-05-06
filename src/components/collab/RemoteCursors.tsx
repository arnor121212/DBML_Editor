import { useViewport } from "@xyflow/react";
import type { PresencePeer } from "@/lib/collab/usePresence";

interface Props {
  /** All connected peers. Self is filtered out so we don't render a ghost
   *  cursor under our own pointer. */
  peers: PresencePeer[];
}

/**
 * Purely presentational — renders remote peers' cursors at their flow
 * coords, transformed back to screen coords. The container is
 * `pointer-events-none` so it never intercepts a click, drag, or hover
 * destined for the React Flow canvas underneath. Local mouse tracking is
 * the canvas's job (DiagramCanvas attaches a listener to its own root).
 */
export function RemoteCursors({ peers }: Props) {
  const viewport = useViewport(); // { x, y, zoom } — re-renders on pan/zoom
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      {peers
        .filter((p) => !p.isSelf && p.cursor)
        .map((p) => (
          <RemoteCursor key={p.clientId} peer={p} viewport={viewport} />
        ))}
    </div>
  );
}

function RemoteCursor({
  peer,
  viewport,
}: {
  peer: PresencePeer;
  viewport: { x: number; y: number; zoom: number };
}) {
  if (!peer.cursor) return null;
  // Manual flow → screen: same math React Flow uses internally.
  const screenX = peer.cursor.x * viewport.zoom + viewport.x;
  const screenY = peer.cursor.y * viewport.zoom + viewport.y;
  return (
    <div
      className="pointer-events-none absolute will-change-transform"
      style={{
        left: 0,
        top: 0,
        transform: `translate(${screenX}px, ${screenY}px)`,
      }}
    >
      <CursorPointer color={peer.color} />
      <span
        className="absolute left-3.5 top-3 whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-medium text-white shadow-md"
        style={{ background: peer.color }}
      >
        {peer.name}
      </span>
    </div>
  );
}

function CursorPointer({ color }: { color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))" }}
    >
      <path
        d="M3 2 L17 10 L10 10 L7 17 Z"
        fill={color}
        stroke="white"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
