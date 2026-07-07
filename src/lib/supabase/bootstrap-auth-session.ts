import type { Session } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

export const AUTH_LOAD_TIMEOUT_MS = 8000;
const GET_SESSION_FAST_PATH_MS = 2000;

export const AUTH_LOAD_ERROR_MESSAGE =
  "Having trouble loading your account. Please refresh.";

export const DATA_LOAD_TIMEOUT_MS = 12000;

export class DataLoadTimeoutError extends Error {
  constructor() {
    super("Data load timed out");
    this.name = "DataLoadTimeoutError";
  }
}

export function raceWithDataLoadTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs = DATA_LOAD_TIMEOUT_MS,
): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new DataLoadTimeoutError()), timeoutMs);
    }),
  ]);
}

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
  let loadedUserId: string | null = null;

  const supabase = createClient();

  const resetDataLoadTracking = () => {
    loadedUserId = null;
  };

  const shouldSkipDuplicateDataLoad = (userId: string) => {
    if (loadedUserId === userId) {
      console.log(
        `${logPrefix} skipping duplicate onAuthenticated call, data already loading/loaded for this session`,
      );
      return true;
    }
    return false;
  };

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

  const handleSession = async (source: string, session: Session | null) => {
    if (cancelled) return;

    if (!session?.user) {
      console.log(`${logPrefix} ${source}: no session`);
      resetDataLoadTracking();
      markAuthResolved(source);
      onUnauthenticated();
      return;
    }

    if (shouldSkipDuplicateDataLoad(session.user.id)) {
      return;
    }

    loadedUserId = session.user.id;
    markAuthResolved(source);
    await loadAuthenticatedData(source, session);
  };

  console.log(`${logPrefix} subscribing to onAuthStateChange first`);

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (cancelled) return;

    console.log(`${logPrefix} onAuthStateChange:`, event, {
      hasSession: Boolean(session?.user),
      userId: session?.user?.id ?? null,
    });

    if (event === "INITIAL_SESSION") {
      await handleSession("onAuthStateChange(INITIAL_SESSION)", session);
      return;
    }

    if (event === "SIGNED_OUT" || !session?.user) {
      console.log(`${logPrefix} onAuthStateChange(${event}): no session`);
      resetDataLoadTracking();
      markAuthResolved(`onAuthStateChange(${event})`);
      onUnauthenticated();
      return;
    }

    await handleSession(`onAuthStateChange(${event})`, session);
  });

  void (async () => {
    console.log(
      `${logPrefix} initial getSession() starting (fast path, ${GET_SESSION_FAST_PATH_MS}ms max wait)`,
    );

    try {
      const getSessionResult = await Promise.race([
        supabase.auth.getSession().then((result) => ({
          kind: "result" as const,
          result,
        })),
        new Promise<{ kind: "timeout" }>((resolve) => {
          window.setTimeout(
            () => resolve({ kind: "timeout" }),
            GET_SESSION_FAST_PATH_MS,
          );
        }),
      ]);

      if (cancelled) return;

      if (getSessionResult.kind === "timeout") {
        console.log(
          `${logPrefix} initial getSession() still pending after ${GET_SESSION_FAST_PATH_MS}ms — deferring to onAuthStateChange(INITIAL_SESSION)`,
        );
        return;
      }

      const {
        data: { session },
        error,
      } = getSessionResult.result;

      console.log(`${logPrefix} initial getSession() fast path result:`, {
        hasSession: Boolean(session?.user),
        userId: session?.user?.id ?? null,
        error: error?.message ?? null,
      });

      if (authResolved || loadedUserId !== null) {
        console.log(
          `${logPrefix} initial getSession() fast path skipped — auth already handled`,
        );
        return;
      }

      await handleSession("initial getSession() fast path", session);
    } catch (error) {
      if (cancelled) return;
      console.error(`${logPrefix} initial getSession() fast path failed:`, error);
    }
  })();

  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
    subscription.unsubscribe();
  };
}
