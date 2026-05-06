import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  side: "left" | "right";
  open: boolean;
  storageKey: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  /** Minimum width the diagram (sibling) is allowed to keep when window or panels squeeze it. */
  minSiblingWidth?: number;
  children: React.ReactNode;
  className?: string;
}

function readWidth(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  const n = v ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function SidePanel({
  side,
  open,
  storageKey,
  defaultWidth,
  minWidth = 280,
  maxWidth = 720,
  minSiblingWidth = 360,
  children,
  className,
}: Props) {
  const [width, setWidth] = useState<number>(() =>
    readWidth(storageKey, defaultWidth, minWidth, maxWidth),
  );
  const asideRef = useRef<HTMLElement>(null);
  const draggingRef = useRef(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function ceilingFor(parent: HTMLElement): number {
      // Diagram floor + space already taken by other side panel(s) inside parent.
      const others = Array.from(parent.children).filter(
        (el) => el !== asideRef.current && el instanceof HTMLElement,
      ) as HTMLElement[];
      const otherWidth = others
        .filter((el) => el.dataset.role === "side-panel")
        .reduce((sum, el) => sum + el.getBoundingClientRect().width, 0);
      return Math.max(minWidth, parent.getBoundingClientRect().width - otherWidth - minSiblingWidth);
    }

    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const parent = asideRef.current?.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const raw = side === "left" ? e.clientX - rect.left : rect.right - e.clientX;
      const ceiling = Math.min(maxWidth, ceilingFor(parent));
      const clamped = Math.max(minWidth, Math.min(ceiling, raw));
      setWidth(clamped);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.localStorage.setItem(storageKey, String(Math.round(widthRef.current)));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [side, minWidth, maxWidth, minSiblingWidth, storageKey]);

  // Clamp our width down (never up) when the parent shrinks enough that the
  // diagram would dip below minSiblingWidth. User-set widths are preserved.
  useLayoutEffect(() => {
    const parent = asideRef.current?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const others = Array.from(parent.children).filter(
        (el) => el !== asideRef.current && el instanceof HTMLElement,
      ) as HTMLElement[];
      const otherSidePanels = others
        .filter((el) => el.dataset.role === "side-panel")
        .reduce((sum, el) => sum + el.getBoundingClientRect().width, 0);
      const ceiling = Math.max(
        minWidth,
        parent.getBoundingClientRect().width - otherSidePanels - minSiblingWidth,
      );
      if (widthRef.current > ceiling) setWidth(ceiling);
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, [open, minWidth, minSiblingWidth]);

  if (!open) return null;

  const handle = (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      className={cn(
        "group/divider relative h-full w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/40",
      )}
    >
      <span
        className="absolute left-1/2 top-1/2 h-10 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity group-hover/divider:opacity-100"
        style={{ background: "color-mix(in oklab, var(--color-primary) 18%, transparent)" }}
      />
    </div>
  );

  return (
    <>
      {side === "right" && handle}
      <aside
        ref={asideRef}
        data-role="side-panel"
        data-side={side}
        style={{ width: Math.round(width), flex: "0 0 auto" }}
        className={cn("h-full overflow-hidden", className)}
      >
        {children}
      </aside>
      {side === "left" && handle}
    </>
  );
}
