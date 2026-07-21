import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { APIError, APIConnectionError } from "@anthropic-ai/sdk";

const DEFAULT_MAX_ATTEMPTS = 3; // initial try + 2 retries
const DEFAULT_DELAY_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAnthropicErrorType(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;

  const record = error as {
    type?: unknown;
    error?: unknown;
  };

  if (typeof record.type === "string" && record.type.trim()) {
    return record.type.trim();
  }

  if (record.error && typeof record.error === "object") {
    const nested = record.error as { type?: unknown; error?: unknown };
    if (typeof nested.type === "string" && nested.type.trim()) {
      return nested.type.trim();
    }
    if (nested.error && typeof nested.error === "object") {
      const inner = nested.error as { type?: unknown };
      if (typeof inner.type === "string" && inner.type.trim()) {
        return inner.type.trim();
      }
    }
  }

  return null;
}

function getAnthropicStatus(error: unknown): number | null {
  if (error instanceof APIError && typeof error.status === "number") {
    return error.status;
  }
  if (error && typeof error === "object") {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return null;
}

/** True for overloaded / rate-limit / 5xx / connection blips worth retrying. */
export function isTransientAnthropicError(error: unknown): boolean {
  if (error instanceof APIConnectionError) {
    return true;
  }

  const status = getAnthropicStatus(error);
  if (status === 429 || status === 529 || (status !== null && status >= 500)) {
    return true;
  }

  const type = getAnthropicErrorType(error);
  if (
    type === "overloaded_error" ||
    type === "rate_limit_error" ||
    type === "api_error"
  ) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return /overloaded_error|overloaded|rate[_ ]?limit|529|\b5\d\d\b/i.test(
    message,
  );
}

type NonStreamingMessageCreateParams = Exclude<
  Parameters<Anthropic["messages"]["create"]>[0],
  { stream: true }
>;
type MessagesCreateOptions = Parameters<Anthropic["messages"]["create"]>[1];

/**
 * Wrap anthropic.messages.create with short retries on transient failures
 * (529 overloaded_error, 429, 5xx, connection errors).
 */
export async function createMessageWithRetry(
  anthropic: Anthropic,
  params: NonStreamingMessageCreateParams,
  options?: MessagesCreateOptions,
  config?: { maxAttempts?: number; delayMs?: number },
): Promise<Message> {
  const maxAttempts = config?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const delayMs = config?.delayMs ?? DEFAULT_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Caller never passes stream:true — cast keeps Message (non-stream) typing.
      return (await anthropic.messages.create(params, options)) as Message;
    } catch (error) {
      lastError = error;
      const shouldRetry =
        attempt < maxAttempts && isTransientAnthropicError(error);

      if (!shouldRetry) {
        throw error;
      }

      console.warn(
        `[anthropic] transient error on attempt ${attempt}/${maxAttempts}; retrying in ${delayMs}ms`,
        error instanceof Error ? error.message : error,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}
