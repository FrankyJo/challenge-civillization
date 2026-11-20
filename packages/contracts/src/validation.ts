import { type z } from "zod";

export interface ContractIssue {
  /** Dotted path into the rejected value, e.g. `payload.reason`; `(root)` for the value itself. */
  readonly path: string;
  readonly message: string;
}

/**
 * Raised when boundary data does not satisfy a contract. Issues carry paths
 * and reasons only, never the rejected values, so they are safe to log and
 * to return in API error details.
 */
export class ContractValidationError extends Error {
  readonly contract: string;
  readonly issues: readonly ContractIssue[];

  constructor(contract: string, issues: readonly ContractIssue[]) {
    super(`Invalid ${contract}: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
    this.name = "ContractValidationError";
    this.contract = contract;
    this.issues = issues;
  }
}

export type ContractResult<T> =
  { readonly success: true; readonly data: T } | { readonly success: false; readonly error: ContractValidationError };

/**
 * Convert Zod issues to value-free issues. Zod echoes unrecognized key names
 * and record keys, which are caller-controlled text, so those are replaced:
 * unrecognized keys are reported by count, and path segments that are not
 * short identifiers or array indices become `[key]`.
 */
export function issuesFromZod(error: z.ZodError, prefix: readonly PropertyKey[] = []): ContractIssue[] {
  return error.issues.map((issue) => ({
    path: formatPath([...prefix, ...issue.path]),
    message:
      issue.code === "unrecognized_keys"
        ? `${issue.keys.length} unrecognized key${issue.keys.length === 1 ? "" : "s"}`
        : issue.message,
  }));
}

const SAFE_SEGMENT = /^[A-Za-z_$][A-Za-z0-9_$-]{0,63}$/;

export function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "(root)";
  return path
    .map((segment) =>
      typeof segment === "number" || (typeof segment === "string" && SAFE_SEGMENT.test(segment))
        ? String(segment)
        : "[key]",
    )
    .join(".");
}

/** Parse with a schema and raise a value-free `ContractValidationError`. */
export function parseContract<S extends z.ZodType>(contract: string, schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ContractValidationError(contract, issuesFromZod(result.error));
  return result.data;
}
