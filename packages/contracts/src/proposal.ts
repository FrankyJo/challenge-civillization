import { z } from "zod";
import { operatorIdSchema, proposalIdSchema, reviewIdSchema, sourceIdSchema } from "./ids.js";
import { utcTimestampSchema } from "./time.js";
import { digestSchema } from "./versions.js";

/**
 * Historical content proposal lifecycle (docs/DATA-AND-AI.md):
 * draft → schema_validated → evidence_reviewed → domain_reviewed →
 * simulated → approved → promoted. Any rejection returns to draft with
 * structured findings. `promoted` is terminal: promoted packs are immutable.
 */
export const PROPOSAL_STATES = [
  "draft",
  "schema_validated",
  "evidence_reviewed",
  "domain_reviewed",
  "simulated",
  "approved",
  "promoted",
] as const;
export const proposalStateSchema = z.enum(PROPOSAL_STATES);
export type ProposalState = z.output<typeof proposalStateSchema>;

/** The single forward successor of each non-terminal state. */
export const PROPOSAL_NEXT_STATE: Readonly<Record<ProposalState, ProposalState | null>> = Object.freeze({
  draft: "schema_validated",
  schema_validated: "evidence_reviewed",
  evidence_reviewed: "domain_reviewed",
  domain_reviewed: "simulated",
  simulated: "approved",
  approved: "promoted",
  promoted: null,
});

/** Advancing moves exactly one stage forward; rejecting returns a non-draft, non-terminal proposal to draft. */
export function isProposalTransitionAllowed(from: ProposalState, to: ProposalState, decision: ReviewDecision): boolean {
  if (decision === "advance") return PROPOSAL_NEXT_STATE[from] === to;
  return to === "draft" && from !== "draft" && from !== "promoted";
}

export const findingSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, "must be a snake_case finding code"),
  message: z.string().min(1).max(2000),
  /** Location inside the proposal the finding refers to, if any. */
  path: z.string().min(1).max(256).optional(),
});
export type Finding = z.output<typeof findingSchema>;

export const PROPOSAL_SCHEMA_VERSION = 1 as const;

export const proposalSchema = z.strictObject({
  schemaVersion: z.literal(PROPOSAL_SCHEMA_VERSION),
  proposalId: proposalIdSchema,
  /** Incremented whenever a rejected proposal is revised in draft. */
  revision: z.number().int().min(1),
  state: proposalStateSchema,
  title: z.string().min(1).max(200),
  theme: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, "must be a snake_case theme"),
  sourceIds: z.array(sourceIdSchema).max(200),
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
});
export type Proposal = z.output<typeof proposalSchema>;

/** Independent verification status of a cited source (URL/citation/quote checks). */
export const sourceVerificationSchema = z.enum(["pending", "verified", "failed"]);
export type SourceVerification = z.output<typeof sourceVerificationSchema>;

export const SOURCE_RECORD_SCHEMA_VERSION = 1 as const;

/** Partial publication date: year, year-month, or full date. */
const partialDate = z
  .string()
  .regex(/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/, "must be YYYY, YYYY-MM or YYYY-MM-DD");

/**
 * A citation URL that verification jobs may fetch: https only, a DNS host
 * name with a public-looking suffix, no credentials, no IP literals and no
 * local/internal names. Fetchers must still re-check the resolved address
 * (DNS can point a public name at a private IP) before connecting.
 */
export const publicHttpsUrlSchema = z
  .url({ protocol: /^https$/, hostname: z.regexes.domain })
  .max(2048)
  .refine((value) => isPublicHttpsUrl(value), "must be a public https URL without credentials or IP/local hosts");

const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home", ".corp", ".arpa"];

function isPublicHttpsUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (url.username !== "" || url.password !== "") return false;
  if (url.port !== "" && url.port !== "443") return false;
  if (!host.includes(".") || host.endsWith(".")) return false;
  if (/^[0-9.]+$/.test(host) || host.startsWith("[")) return false;
  if (/^0x|\.0x/.test(host)) return false;
  return !LOCAL_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
}

export const sourceRecordSchema = z.strictObject({
  schemaVersion: z.literal(SOURCE_RECORD_SCHEMA_VERSION),
  sourceId: sourceIdSchema,
  title: z.string().min(1).max(500),
  /** Authors and/or institutions as cited. */
  authors: z.array(z.string().min(1).max(200)).min(1).max(50),
  locator: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("url"), url: publicHttpsUrlSchema }),
    z.strictObject({ kind: z.literal("bibliographic"), citation: z.string().min(1).max(1000) }),
  ]),
  sourceType: z.enum(["primary", "scholarly", "institutional", "reference", "other"]),
  publishedOn: partialDate.nullable(),
  accessedAt: utcTimestampSchema,
  claimSummary: z.string().min(1).max(2000),
  license: z.string().min(1).max(500),
  archivedChecksum: digestSchema.nullable(),
  verification: sourceVerificationSchema,
});
export type SourceRecord = z.output<typeof sourceRecordSchema>;

export const reviewDecisionSchema = z.enum(["advance", "reject"]);
export type ReviewDecision = z.output<typeof reviewDecisionSchema>;

export const reviewerRoleSchema = z.enum(["editor", "operator", "administrator"]);

export const PROPOSAL_REVIEW_SCHEMA_VERSION = 1 as const;

/** One recorded stage decision. Internal: contains reviewer identity. */
export const proposalReviewSchema = z
  .strictObject({
    schemaVersion: z.literal(PROPOSAL_REVIEW_SCHEMA_VERSION),
    reviewId: reviewIdSchema,
    proposalId: proposalIdSchema,
    revision: z.number().int().min(1),
    from: proposalStateSchema,
    to: proposalStateSchema,
    decision: reviewDecisionSchema,
    reviewer: z.strictObject({ operatorId: operatorIdSchema, role: reviewerRoleSchema }),
    findings: z.array(findingSchema).max(200),
    decidedAt: utcTimestampSchema,
  })
  .superRefine((review, context) => {
    if (!isProposalTransitionAllowed(review.from, review.to, review.decision)) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: `${review.decision} cannot move a proposal from ${review.from} to ${review.to}`,
      });
    }
    if (review.decision === "reject" && review.findings.length === 0) {
      context.addIssue({ code: "custom", path: ["findings"], message: "a rejection requires at least one finding" });
    }
  });
export type ProposalReview = z.output<typeof proposalReviewSchema>;
