import "server-only";

const DEFAULT_MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 503, 504, 520]);

interface SupabaseRestFetchOptions {
  fetcher?: typeof fetch;
  operation: string;
  maxAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface PostgrestErrorBody {
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
}

export class SupabaseRestError extends Error {
  readonly operation: string;
  readonly status?: number;
  readonly code?: string;
  readonly details?: string;
  readonly hint?: string;
  readonly attempts: number;

  constructor(input: {
    operation: string;
    message: string;
    attempts: number;
    status?: number;
    code?: string;
    details?: string;
    hint?: string;
    cause?: unknown;
  }) {
    super(
      `${input.operation}: ${input.message}`,
      input.cause === undefined ? undefined : { cause: input.cause },
    );
    this.name = "SupabaseRestError";
    this.operation = input.operation;
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
    this.hint = input.hint;
    this.attempts = input.attempts;
  }
}

function boundedAttempts(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_MAX_ATTEMPTS;
  return Math.min(Math.max(Math.trunc(value ?? DEFAULT_MAX_ATTEMPTS), 1), 3);
}

function isRetryableMethod(method: string | undefined) {
  const normalized = (method ?? "GET").toUpperCase();
  return normalized === "GET" || normalized === "HEAD";
}

function retryDelay(attempt: number) {
  return attempt === 1 ? 100 : 250;
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function textField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function fetchSupabaseRest(
  input: RequestInfo | URL,
  init: RequestInit,
  options: SupabaseRestFetchOptions,
) {
  const fetcher = options.fetcher ?? fetch;
  const canRetry = isRetryableMethod(init.method);
  const maxAttempts = canRetry ? boundedAttempts(options.maxAttempts) : 1;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetcher(input, init);
      const shouldRetry =
        attempt < maxAttempts && RETRYABLE_STATUS_CODES.has(response.status);
      if (!shouldRetry) return response;
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new SupabaseRestError({
          operation: options.operation,
          message: "falló la conexión con Supabase",
          attempts: attempt,
          cause: error,
        });
      }
    }

    await sleep(retryDelay(attempt));
  }

  throw new SupabaseRestError({
    operation: options.operation,
    message: "la solicitud terminó sin respuesta",
    attempts: maxAttempts,
  });
}

export async function supabaseRestResponseError(
  response: Response,
  operation: string,
  attempts = 1,
) {
  let body: PostgrestErrorBody = {};
  try {
    body = (await response.clone().json()) as PostgrestErrorBody;
  } catch {
    // A non-JSON proxy response is still represented by status and status text.
  }

  return new SupabaseRestError({
    operation,
    message: textField(body.message) ?? response.statusText ?? "Supabase rechazó la solicitud",
    attempts,
    status: response.status,
    code: textField(body.code),
    details: textField(body.details),
    hint: textField(body.hint),
  });
}
