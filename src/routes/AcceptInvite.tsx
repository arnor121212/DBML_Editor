import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { acceptInvite } from "@/lib/sharing/queries";
import { formatError } from "@/lib/utils";

/**
 * /invite/:token — handles invite acceptance.
 * - Anonymous users are bounced to /login with `?from=/invite/<token>` so the
 *   invite is resumed once they sign in.
 * - Signed-in users see a confirm screen, click Accept, and are forwarded to
 *   the schema. The RPC verifies their email matches the invite.
 */
export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedSchemaId, setAcceptedSchemaId] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [token]);

  if (!token) {
    return <Navigate to="/" replace />;
  }

  if (isLoading) return <Centered>Loading…</Centered>;

  if (!user) {
    // Bounce to login; they'll come back here after auth.
    return (
      <Navigate
        to="/login"
        state={{ from: { pathname: location.pathname } }}
        replace
      />
    );
  }

  if (acceptedSchemaId) {
    return <Navigate to={`/s/${acceptedSchemaId}`} replace />;
  }

  async function accept() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const schemaId = await acceptInvite(token);
      setAcceptedSchemaId(schemaId);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-radial-fade p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-xl">
        {error ? (
          <>
            <AlertTriangle className="mx-auto size-7 text-destructive" />
            <h1 className="mt-3 text-base font-semibold tracking-tight">
              Invite couldn&apos;t be accepted
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/">Back to dashboard</Link>
            </Button>
          </>
        ) : (
          <>
            <CheckCircle2 className="mx-auto size-7 text-primary" />
            <h1 className="mt-3 text-base font-semibold tracking-tight">
              Accept invite to a SchemaSync schema
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              You&apos;re signed in as{" "}
              <span className="font-medium text-foreground">{user.email}</span>.
              Accept to gain access.
            </p>
            <Button onClick={accept} disabled={busy} className="mt-5 w-full">
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Accept invite"
              )}
            </Button>
            <Button
              asChild
              variant="ghost"
              className="mt-2 w-full"
              disabled={busy}
            >
              <Link to="/">Cancel</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-radial-fade text-sm text-muted-foreground">
      {children}
    </div>
  );
}
