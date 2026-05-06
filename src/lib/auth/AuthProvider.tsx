import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  configured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{
    error: Error | null;
    /** True when the user must click an email confirmation link before signing in. */
    needsEmailConfirmation: boolean;
  }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(isSupabaseConfigured);

  // Subscribe to auth changes; the SDK emits `INITIAL_SESSION` on mount with
  // whatever's in storage, which is enough — no separate `getSession()` call
  // (avoids a hung `isLoading` if the network never responds).
  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
      if (event === "INITIAL_SESSION") setIsLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: new Error("Supabase is not configured.") };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ?? null };
    },
    [],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabase)
        return {
          error: new Error("Supabase is not configured."),
          needsEmailConfirmation: false,
        };
      const { data, error } = await supabase.auth.signUp({ email, password });
      // If email confirmation is enabled, signUp returns a user with no session
      // and Supabase emails a confirmation link.
      const needsEmailConfirmation = !!data.user && !data.session;
      return { error: error ?? null, needsEmailConfirmation };
    },
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return { error: new Error("Supabase is not configured.") };
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { error: error ?? null };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      configured: isSupabaseConfigured,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signOut,
    }),
    [
      user,
      session,
      isLoading,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
