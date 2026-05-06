import { Link } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";
import { SignInButton } from "@/components/auth/SignInButton";
import { useAuth } from "@/lib/auth/AuthProvider";
import { cn } from "@/lib/utils";

export function AppHeader({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const { user, isLoading, configured } = useAuth();
  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface/70 px-4 backdrop-blur",
        className,
      )}
    >
      <Link to="/" className="group flex items-center gap-2">
        <Logo />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          SchemaSync
        </span>
      </Link>
      <div className="flex flex-1 items-center gap-2 px-1">{children}</div>
      <ThemeToggle />
      {configured && !isLoading && (user ? <UserMenu /> : <SignInButton />)}
    </header>
  );
}

function Logo() {
  return (
    <span className="relative grid h-7 w-7 place-items-center overflow-hidden rounded-md bg-gradient-to-br from-primary to-collab text-primary-foreground shadow-[0_1px_0_0_color-mix(in_oklab,white_25%,transparent)_inset]">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none">
        <path
          d="M5 8.5C5 7 6.5 6 9 6h6c2.5 0 4 1 4 2.5S17.5 11 15 11H9C6.5 11 5 10 5 8.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M5 15.5C5 14 6.5 13 9 13h6c2.5 0 4 1 4 2.5S17.5 18 15 18H9c-2.5 0-4-1-4-2.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          opacity="0.75"
        />
      </svg>
    </span>
  );
}
