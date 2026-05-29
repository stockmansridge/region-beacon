import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AuthState = {
  status: "loading" | "authenticated" | "unauthenticated";
  session: Session | null;
  email: string | null;
};

/**
 * Subscribes to Supabase auth state changes on the STAGING project.
 * Returns the current session, email and a coarse status flag.
 */
export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthState["status"]>("loading");

  useEffect(() => {
    let cancelled = false;
    // Register listener FIRST so we don't miss an event during the initial getSession call.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (cancelled) return;
      setSession(next);
      setStatus(next ? "authenticated" : "unauthenticated");
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setStatus(data.session ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        // Never leave the app stuck on "loading" if getSession fails.
        if (cancelled) return;
        setSession(null);
        setStatus("unauthenticated");
      });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { status, session, email: session?.user?.email ?? null };
}

export async function signOut() {
  await supabase.auth.signOut();
}
