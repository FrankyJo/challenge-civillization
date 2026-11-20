#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const prompts = readdirSync(resolve(root, "prompts/phases"))
  .filter((name) => /^\d{2}-.*\.md$/.test(name))
  .sort();
const reportDir = resolve(root, "docs/phase-reports");
const reports = existsSync(reportDir)
  ? new Set(readdirSync(reportDir).filter((name) => /^\d{2}\.md$/.test(name)))
  : new Set();

console.log("Phase  Report  Prompt");
for (const prompt of prompts) {
  const id = prompt.slice(0, 2);
  console.log(`${id}     ${reports.has(`${id}.md`) ? "yes   " : "no    "}  ${prompt}`);
}
console.log("\nA report records evidence; it does not by itself prove that a phase passed.");
