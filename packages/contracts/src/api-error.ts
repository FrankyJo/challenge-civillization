import { z } from "zod";
import { correlationIdSchema } from "./ids.js";
import { type ContractIssue } from "./validation.js";

export const API_ERROR_SCHEMA_VERSION = 1 as const;

/** Stable machine-readable error codes and their HTTP statuses. */
export const API_ERROR_STATUS = Object.freeze({
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  internal: 500,
  unavailable: 503,
} as const);

export type ApiErrorCode = keyof typeof API_ERROR_STATUS;
export const apiErrorCodeSchema = z.enum(Object.keys(API_ERROR_STATUS) as [ApiErrorCode, ...ApiErrorCode[]]);

/** Default human-readable messages; they never include request data. */
export const API_ERROR_MESSAGES: Readonly<Record<ApiErrorCode, string>> = Object.freeze({
  invalid_request: "The request is invalid.",
  unauthorized: "Authentication is required.",
  forbidden: "You do not have permission to perform this action.",
  not_found: "The requested resource does not exist.",
  method_not_allowed: "This method is not allowed for the resource.",
  conflict: "The request conflicts with the current state.",
  payload_too_large: "The request body is too large.",
  unsupported_media_type: "The request content type is not supported.",
  rate_limited: "Too many requests. Retry later.",
  internal: "An internal error occurred.",
  unavailable: "The service is temporarily unavailable.",
});

const issueSchema = z.strictObject({ path: z.string().min(1).max(256), message: z.string().min(1).max(500) });

/** The only error body any HTTP endpoint returns. */
export const apiErrorSchema = z.strictObject({
  schemaVersion: z.literal(API_ERROR_SCHEMA_VERSION),
  error: z.strictObject({
    code: apiErrorCodeSchema,
    message: z.string().min(1).max(500),
    correlationId: correlationIdSchema,
    details: z.array(issueSchema).max(50),
    retryAfterSeconds: z.number().int().positive().optional(),
  }),
});
export type ApiError = z.output<typeof apiErrorSchema>;

export interface ApiErrorInit {
  readonly code: ApiErrorCode;
  readonly correlationId: string;
  readonly message?: string;
  readonly details?: readonly ContractIssue[];
  readonly retryAfterSeconds?: number;
}

/** Correlation ID used when the caller's is not a valid token. */
export const UNKNOWN_CORRELATION_ID = "unknown";

/**
 * Build a validated error body. It must never throw while an error is being
 * reported: details beyond the limit are truncated, over-long text is cut,
 * and an invalid correlation ID is replaced with `unknown`.
 */
export function createApiError(init: ApiErrorInit): ApiError {
  const correlationId = correlationIdSchema.safeParse(init.correlationId).success
    ? init.correlationId
    : UNKNOWN_CORRELATION_ID;
  const message = (init.message ?? "").trim().slice(0, 500) || API_ERROR_MESSAGES[init.code];
  const retryAfterSeconds =
    init.retryAfterSeconds !== undefined && Number.isSafeInteger(init.retryAfterSeconds) && init.retryAfterSeconds > 0
      ? init.retryAfterSeconds
      : undefined;
  return apiErrorSchema.parse({
    schemaVersion: API_ERROR_SCHEMA_VERSION,
    error: {
      code: init.code,
      message,
      correlationId,
      details: (init.details ?? [])
        .slice(0, 50)
        .map((issue) => ({ path: issue.path.slice(0, 256), message: issue.message.slice(0, 500) }))
        .filter((issue) => issue.path.length > 0 && issue.message.length > 0),
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    },
  });
}

export function apiErrorStatus(code: ApiErrorCode): number {
  return API_ERROR_STATUS[code];
}
