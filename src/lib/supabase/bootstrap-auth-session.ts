import type { Session } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

export const AUTH_LOAD_TIMEOUT_MS = 8000;

export const AUTH_LOAD_ERROR_MESSAGE =
  "Having trouble loading your account. Please refresh.";

type BootstrapAuthSessionOptions = {
  logPrefix: string;
  onAuthenticated: (session: Session) => Promise<void>;
  onUnauthenticated: () => void;
  onTimeout: () => void;
};

export function bootstrapAuthSession({
  logPrefix,
  onAuthenticated,
  onUnauthenticated,
  onTimeout,
}: BootstrapAuthSessionOptions): () => void {
  let cancelled = false;
  let authResolved = false;
  let subscription: { unsubscribe: () => void } | null = null;

  const supabase = createClient();

  const markAuthResolved = (source: string) => {
    if (authResolved) {
      console.log(`${logPrefix} auth already resolved, skipping mark from ${source}`);
      return;
    }

    console.log(`${logPrefix} marking auth resolved from ${source}`);
    authResolved = true;
    window.clearTimeout(timeoutId);
    console.log(`${logPrefix} auth resolved flag set, timeout cleared`);
  };

  const timeoutId = window.setTimeout(() => {
    if (cancelled || authResolved) return;
    console.log(
      `${logPrefix} auth load timeout fired after ${AUTH_LOAD_TIMEOUT_MS}ms`,
    );
    markAuthResolved("timeout");
    onTimeout();
  }, AUTH_LOAD_TIMEOUT_MS);

  const loadAuthenticatedData = async (source: string, session: Session) => {
    if (cancelled) return;

    console.log(`${logPrefix} loading data from ${source}...`);
    try {
      await onAuthenticated(session);
      if (cancelled) return;
      console.log(`${logPrefix} data loaded from ${source}`);
    } catch (error) {
      console.error(`${logPrefix} data load failed from ${source}`, error);
      if (!cancelled) {
        onTimeout();
      }
    }
  };

  void (async () => {
    console.log(`${logPrefix} initial getSession() starting`);
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (cancelled) return;

      console.log(`${logPrefix} initial getSession() result:`, {
        hasSession: Boolean(session?.user),
        userId: session?.user?.id ?? null,
        error: error?.message ?? null,
      });

      markAuthResolved("initial getSession()");

      if (!session?.user) {
        console.log(`${logPrefix} initial getSession(): no session`);
        onUnauthenticated();
      } else {
        await loadAuthenticatedData("initial getSession()", session);
      }
    } catch (error) {
      if (cancelled) return;

      console.error(`${logPrefix} initial getSession() failed:`, error);
      markAuthResolved("initial getSession() failed");
      onTimeout();
    }

    if (cancelled) return;

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      console.log(`${logPrefix} onAuthStateChange:`, event, {
        hasSession: Boolean(session?.user),
        userId: session?.user?.id ?? null,
      });

      if (event === "INITIAL_SESSION") {
        markAuthResolved("onAuthStateChange(INITIAL_SESSION)");
        return;
      }

      markAuthResolved(`onAuthStateChange(${event})`);

      if (!session?.user) {
        console.log(`${logPrefix} onAuthStateChange(${event}): no session`);
        onUnauthenticated();
        return;
      }

      await loadAuthenticatedData(`onAuthStateChange(${event})`, session);
    });

    subscription = authSubscription;
  })();

  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
    subscription?.unsubscribe();
  };
}
