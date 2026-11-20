#!/usr/bin/env node
// Regenerate schemas/*.json and SCHEMAS.md from the built catalog (run `build` first).
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { renderSchemaDocuments } from "../dist/index.js";

const root = resolve(import.meta.dirname, "..");
const documents = renderSchemaDocuments();
const keep = new Set(documents.map((document) => document.path));
mkdirSync(join(root, "schemas"), { recursive: true });
for (const name of readdirSync(join(root, "schemas"))) {
  if (!keep.has(`schemas/${name}`)) rmSync(join(root, "schemas", name));
}
for (const document of documents) {
  mkdirSync(dirname(join(root, document.path)), { recursive: true });
  writeFileSync(join(root, document.path), document.content);
}
console.log(`Wrote ${documents.length} schema documents.`);
