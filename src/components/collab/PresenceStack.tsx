import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PresencePeer } from "@/lib/collab/usePresence";

const MAX_VISIBLE = 4;

export function PresenceStack({ peers }: { peers: PresencePeer[] }) {
  if (peers.length === 0) return null;
  // Self last so others render on top of self in the stack.
  const ordered = [...peers].sort((a, b) =>
    a.isSelf === b.isSelf ? 0 : a.isSelf ? 1 : -1,
  );
  const visible = ordered.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, ordered.length - MAX_VISIBLE);

  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((peer) => (
        <Tooltip key={peer.clientId} delayDuration={120}>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "relative grid size-7 place-items-center rounded-full text-[11px] font-semibold text-white ring-2 ring-background",
                peer.isSelf ? "z-0" : "z-10",
              )}
              style={{ background: peer.color }}
              aria-label={peer.name}
            >
              {peer.avatarUrl ? (
                <img
                  src={peer.avatarUrl}
                  alt=""
                  className="absolute inset-0 size-full rounded-full object-cover"
                />
              ) : (
                initialsFor(peer.name)
              )}
              <span
                className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background"
                style={{ background: "oklch(0.7 0.18 155)" }}
                aria-hidden
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="text-xs font-medium">
              {peer.name}
              {peer.isSelf && (
                <span className="ml-1 text-muted-foreground">(you)</span>
              )}
            </div>
            {peer.email && peer.email !== peer.name && (
              <div className="text-[11px] text-muted-foreground">
                {peer.email}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      ))}
      {overflow > 0 && (
        <span className="z-20 grid size-7 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-muted-foreground ring-2 ring-background">
          +{overflow}
        </span>
      )}
    </div>
  );
}

function initialsFor(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
