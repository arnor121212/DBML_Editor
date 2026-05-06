import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  left: React.ReactNode;
  right: React.ReactNode;
  /** Initial split percentage (0-100) for the left panel. */
  initial?: number;
  min?: number;
  max?: number;
  storageKey?: string;
  className?: string;
}

export function SplitPane({
  left,
  right,
  initial = 35,
  min = 22,
  max = 65,
  storageKey,
  className,
}: Props) {
  const [pct, setPct] = useState<number>(() => {
    if (typeof window !== "undefined" && storageKey) {
      const v = window.localStorage.getItem(storageKey);
      const n = v ? Number(v) : NaN;
      if (!Number.isNaN(n) && n >= min && n <= max) return n;
    }
    return initial;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(min, Math.min(max, next));
      setPct(clamped);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (storageKey) window.localStorage.setItem(storageKey, String(pct));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [min, max, pct, storageKey]);

  return (
    <div
      ref={containerRef}
      className={cn("flex h-full w-full overflow-hidden", className)}
    >
      <div className="h-full overflow-hidden" style={{ width: `${pct}%` }}>
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={onMouseDown}
        className="group/divider relative h-full w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors"
      >
        <span
          className="absolute left-1/2 top-1/2 h-10 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity group-hover/divider:opacity-100"
          style={{ background: "color-mix(in oklab, var(--color-primary) 18%, transparent)" }}
        />
      </div>
      <div className="h-full flex-1 overflow-hidden">{right}</div>
    </div>
  );
}
