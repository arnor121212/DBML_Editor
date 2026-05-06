import { cn } from "@/lib/utils";

export function Kbd({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 text-[10px] font-medium text-muted-foreground shadow-[0_1px_0_0_color-mix(in_oklab,white_8%,transparent)_inset]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
