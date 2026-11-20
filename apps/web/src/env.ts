import { z } from "zod";

const webEnvSchema = z.object({
  /** Same-origin path the API is reachable under (proxied in dev/preview). */
  VITE_API_BASE_PATH: z
    .string()
    .regex(/^\/[A-Za-z0-9/_-]*$/, "must be an absolute same-origin path")
    .default("/api"),
});
export type WebEnv = z.infer<typeof webEnvSchema>;

export function parseWebEnv(source: Readonly<Record<string, unknown>>): WebEnv {
  const value = source["VITE_API_BASE_PATH"];
  return webEnvSchema.parse({ VITE_API_BASE_PATH: typeof value === "string" && value !== "" ? value : undefined });
}
