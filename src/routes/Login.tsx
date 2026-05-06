import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ArrowLeft, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/AuthProvider";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";

interface LocationState {
  from?: { pathname: string };
}

export function Login() {
  const { user, isLoading, configured, signInWithPassword, signUpWithPassword, signInWithGoogle } =
    useAuth();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from?.pathname ?? "/";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"none" | "email" | "google">("none");
  const [confirmationSent, setConfirmationSent] = useState(false);

  if (!isLoading && user) return <Navigate to={from} replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setBusy("email");
    try {
      if (mode === "signin") {
        const { error } = await signInWithPassword(email, password);
        if (error) {
          toast.error("Couldn't sign in", { description: error.message });
        } else {
          toast.success("Welcome back");
        }
      } else {
        const { error, needsEmailConfirmation } = await signUpWithPassword(email, password);
        if (error) {
          toast.error("Couldn't create account", { description: error.message });
        } else if (needsEmailConfirmation) {
          setConfirmationSent(true);
        } else {
          toast.success("Account created");
        }
      }
    } finally {
      setBusy("none");
    }
  }

  async function googleClick() {
    setBusy("google");
    const { error } = await signInWithGoogle();
    if (error) {
      toast.error("Google sign-in failed", { description: error.message });
      setBusy("none");
      return;
    }
    // Browser should redirect to Google now. If it doesn't (popup blocker, no
    // `url` returned, etc.), unstick the button after a few seconds.
    window.setTimeout(() => {
      setBusy((b) => (b === "google" ? "none" : b));
    }, 5000);
  }

  return (
    <div className="grid min-h-screen place-items-center bg-radial-fade p-6">
      <div className="w-full max-w-sm">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Back to dashboard
        </Link>

        <div className="rounded-xl border border-border bg-card p-6 shadow-2xl">
          <Logo />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            {mode === "signin" ? "Sign in to SchemaSync" : "Create your SchemaSync account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Continue where you left off."
              : "Save your schemas across devices and (soon) collaborate in real time."}
          </p>

          {!configured && <ConfigurationWarning />}

          {confirmationSent ? (
            <ConfirmationNotice email={email} />
          ) : (
            <>
              <Tabs mode={mode} setMode={setMode} disabled={busy !== "none"} />

              <form onSubmit={submit} className="mt-5 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!configured || busy !== "none"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={!configured || busy !== "none"}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!configured || busy !== "none"}
                >
                  {busy === "email" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : mode === "signin" ? (
                    "Sign in"
                  ) : (
                    "Create account"
                  )}
                </Button>
              </form>

              <Divider />

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={googleClick}
                disabled={!configured || busy !== "none"}
              >
                {busy === "google" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <GoogleIcon />
                    Continue with Google
                  </>
                )}
              </Button>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Continue without signing in?{" "}
          <Link to="/" className="text-foreground hover:underline">
            Use SchemaSync locally
          </Link>{" "}
          — schemas save to this browser only.
        </p>
      </div>
    </div>
  );
}

function Tabs({
  mode,
  setMode,
  disabled,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-5 inline-flex w-full rounded-md border border-border bg-surface-2 p-0.5 text-sm">
      {(["signin", "signup"] as const).map((m) => (
        <button
          key={m}
          type="button"
          disabled={disabled}
          onClick={() => setMode(m)}
          className={cn(
            "flex-1 rounded px-3 py-1.5 transition-colors",
            mode === m
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {m === "signin" ? "Sign in" : "Sign up"}
        </button>
      ))}
    </div>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">or</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function ConfigurationWarning() {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground/90">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
      <span>
        Supabase isn&apos;t configured. Add{" "}
        <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">
          VITE_SUPABASE_URL
        </code>{" "}
        and{" "}
        <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">
          VITE_SUPABASE_ANON_KEY
        </code>{" "}
        to <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">.env.local</code>{" "}
        and restart the dev server.
      </span>
    </div>
  );
}

function ConfirmationNotice({ email }: { email: string }) {
  return (
    <div className="mt-5 flex flex-col items-center rounded-lg border border-success/30 bg-success/10 p-4 text-center">
      <CheckCircle2 className="size-6 text-success" />
      <h2 className="mt-2 text-sm font-semibold">Check your inbox</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        We sent a confirmation link to{" "}
        <span className="font-medium text-foreground">{email}</span>. Click it
        to finish setting up your account.
      </p>
    </div>
  );
}

function Logo() {
  return (
    <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-md bg-gradient-to-br from-primary to-collab text-primary-foreground shadow-[0_1px_0_0_color-mix(in_oklab,white_25%,transparent)_inset]">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M21.35 11.1H12v3.8h5.35c-.23 1.4-1.61 4.1-5.35 4.1-3.22 0-5.85-2.66-5.85-5.95s2.63-5.95 5.85-5.95c1.83 0 3.05.78 3.75 1.45l2.55-2.45C16.7 4.6 14.6 3.6 12 3.6 6.93 3.6 2.85 7.68 2.85 12.75s4.08 9.15 9.15 9.15c5.28 0 8.78-3.7 8.78-8.92 0-.6-.06-1.07-.13-1.88z"
      />
    </svg>
  );
}
