import { healthReportSchema, type HealthReport } from "@civ/contracts";

export type ApiStatusView =
  | { readonly state: "ok"; readonly label: string; readonly report: HealthReport }
  | { readonly state: "degraded"; readonly label: string; readonly report: HealthReport }
  | { readonly state: "unreachable"; readonly label: string };

/** Interpret a readiness response. Malformed bodies are treated as unreachable. */
export function describeApiHealth(body: unknown): ApiStatusView {
  const parsed = healthReportSchema.safeParse(body);
  if (!parsed.success) return { state: "unreachable", label: "API unreachable" };
  const report = parsed.data;
  if (report.status === "ok") return { state: "ok", label: `API ready (v${report.version})`, report };
  const failing = Object.entries(report.checks)
    .filter(([, check]) => check.status !== "ok")
    .map(([name]) => name)
    .sort();
  return { state: "degraded", label: `API degraded: ${failing.join(", ") || "unknown"} down`, report };
}

export async function fetchApiHealth(basePath: string, fetchImpl: typeof fetch = fetch): Promise<ApiStatusView> {
  try {
    const response = await fetchImpl(`${basePath}/health/ready`, { headers: { accept: "application/json" } });
    return describeApiHealth(await response.json());
  } catch {
    return { state: "unreachable", label: "API unreachable" };
  }
}
