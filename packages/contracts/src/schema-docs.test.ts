import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packageRoot } from "../test/fixtures.js";
import { CONTRACT_CATALOG } from "./catalog.js";
import { renderSchemaDocuments } from "./schema-docs.js";

const REGENERATE = "Run `pnpm --filter @civ/contracts schemas:write` and commit the result.";

describe("generated schema documents", () => {
  const documents = renderSchemaDocuments();

  it.each(documents.map((document) => [document.path, document.content] as const))(
    "%s matches the code",
    (path, content) => {
      const file = join(packageRoot, path);
      expect(existsSync(file), `${path} is missing. ${REGENERATE}`).toBe(true);
      expect(readFileSync(file, "utf8"), `${path} is stale. ${REGENERATE}`).toBe(content);
    },
  );

  it("contain no orphaned schema files", () => {
    const expected = documents.filter((d) => d.path.startsWith("schemas/")).map((d) => d.path.slice("schemas/".length));
    expect(readdirSync(join(packageRoot, "schemas")).sort()).toEqual(expected.sort());
  });

  it("use unique contract names", () => {
    const names = CONTRACT_CATALOG.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
