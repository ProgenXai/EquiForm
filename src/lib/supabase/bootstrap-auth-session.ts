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
  let authCheckComplete = false;

  const supabase = createClient();

  const completeAuthCheck = () => {
    authCheckComplete = true;
  };

  const timeoutId = window.setTimeout(() => {
    if (cancelled || authCheckComplete) return;
    console.log(
      `${logPrefix} auth load timeout fired after ${AUTH_LOAD_TIMEOUT_MS}ms`,
    );
    completeAuthCheck();
    onTimeout();
  }, AUTH_LOAD_TIMEOUT_MS);

  const handleSession = async (source: string, session: Session | null) => {
    if (cancelled) return;

    if (!session?.user) {
      console.log(`${logPrefix} ${source}: no session`);
      onUnauthenticated();
      return;
    }

    await onAuthenticated(session);
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

      completeAuthCheck();
      window.clearTimeout(timeoutId);
      await handleSession("initial getSession()", session);
    } catch (error) {
      if (cancelled) return;

      console.log(`${logPrefix} initial getSession() failed:`, error);
      completeAuthCheck();
      window.clearTimeout(timeoutId);
      onTimeout();
    }
  })();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (cancelled) return;

    console.log(`${logPrefix} onAuthStateChange:`, event, {
      hasSession: Boolean(session?.user),
      userId: session?.user?.id ?? null,
    });

    if (!authCheckComplete) {
      completeAuthCheck();
      window.clearTimeout(timeoutId);
    }

    await handleSession(`onAuthStateChange(${event})`, session);
  });

  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
    subscription.unsubscribe();
  };
}
