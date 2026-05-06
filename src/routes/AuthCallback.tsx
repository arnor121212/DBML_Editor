import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * OAuth redirect handler. The Supabase client's `detectSessionInUrl` already
 * handles the PKCE code exchange automatically on mount — calling it manually
 * here would consume the code twice and fail. We just surface any error from
 * the URL and wait for the session to resolve via `useAuth()`.
 */
export function AuthCallback() {
  const { user, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Supabase is not configured.");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const errDesc = params.get("error_description");
    if (errDesc) setError(errDesc);
  }, []);

  if (error) {
    return (
      <div className="grid h-screen place-items-center bg-radial-fade">
        <div className="max-w-sm rounded-lg border border-destructive/40 bg-card p-6 text-center">
          <AlertTriangle className="mx-auto size-6 text-destructive" />
          <h2 className="mt-3 text-base font-semibold">Sign-in failed</h2>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button asChild className="mt-4" variant="outline">
            <a href="/login">Back to sign in</a>
          </Button>
        </div>
      </div>
    );
  }

  if (!isLoading && user) return <Navigate to="/" replace />;

  return (
    <div className="grid h-screen place-items-center bg-radial-fade">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Signing you in…
      </div>
    </div>
  );
}
