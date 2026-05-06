import { useMemo } from "react";
import { LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { stringToHue } from "@/lib/utils";

export function UserMenu() {
  const { user, signOut } = useAuth();
  if (!user) return null;

  const email = user.email ?? "";
  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    email.split("@")[0];
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full p-0.5 outline-hidden transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label="Account menu"
        >
          <Avatar name={name} email={email} avatarUrl={avatarUrl} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <div className="flex flex-col gap-0.5 py-0.5">
            <span className="text-sm font-medium text-foreground">{name}</span>
            {email && <span className="text-xs text-muted-foreground">{email}</span>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Avatar({
  name,
  email,
  avatarUrl,
}: {
  name: string;
  email: string;
  avatarUrl?: string;
}) {
  const initials = useMemo(() => initialsFor(name || email), [name, email]);
  const hue = useMemo(() => stringToHue(email || name), [email, name]);
  const bg = `oklch(0.62 0.16 ${hue})`;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="size-7 rounded-full border border-border object-cover"
      />
    );
  }
  return (
    <span
      className="grid size-7 place-items-center rounded-full text-[11px] font-semibold text-white shadow-[0_1px_0_0_color-mix(in_oklab,white_25%,transparent)_inset]"
      style={{ background: bg }}
    >
      {initials || <UserIcon className="size-3.5" />}
    </span>
  );
}

function initialsFor(s: string): string {
  if (!s) return "";
  const parts = s.replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return s[0]?.toUpperCase() ?? "";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
