import { z } from "zod";
import { CONTRACT_CATALOG, type ContractEntry } from "./catalog.js";

export interface GeneratedDocument {
  /** Path relative to the contracts package root. */
  readonly path: string;
  readonly content: string;
}

export function schemaFileName(entry: Pick<ContractEntry, "name" | "version">): string {
  return `schemas/${entry.name}.v${entry.version}.schema.json`;
}

/**
 * Render JSON Schema (draft 2020-12) for every catalog entry plus an index.
 * Output is deterministic so a test can require the committed files to match.
 */
export function renderSchemaDocuments(catalog: readonly ContractEntry[] = CONTRACT_CATALOG): GeneratedDocument[] {
  const documents = catalog.map((entry) => ({
    path: schemaFileName(entry),
    content: `${JSON.stringify(
      {
        ...z.toJSONSchema(entry.schema, { target: "draft-2020-12", unrepresentable: "throw" }),
        title: `${entry.name} v${entry.version}`,
        description: entry.description,
      },
      null,
      2,
    )}\n`,
  }));
  const rows = catalog.map(
    (entry) =>
      `| \`${entry.name}\` | ${entry.version} | ${entry.audience} | [schema](${schemaFileName(entry)}) | ${entry.description} |`,
  );
  const index = [
    "# Contract schemas",
    "",
    "Generated from `src/catalog.ts` by `pnpm --filter @civ/contracts schemas:write`. Do not edit by hand;",
    "`src/schema-docs.test.ts` fails when these files drift from the code.",
    "",
    "Rules: see `docs/CONTRACTS.md`. Public contracts may be returned by public endpoints; internal",
    "contracts must never be, except through an explicit public DTO allowlist.",
    "",
    "| Contract | Version | Audience | Schema | Description |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
  return [...documents, { path: "SCHEMAS.md", content: index }];
}
