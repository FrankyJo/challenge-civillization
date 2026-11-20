#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const errors = [];
const required = [
  "README.md",
  "CLAUDE.md",
  "package.json",
  "docker-compose.yml",
  "docs/PRODUCT.md",
  "docs/ARCHITECTURE.md",
  "docs/DOMAIN.md",
  "docs/DATA-AND-AI.md",
  "docs/ANALYTICS-ARCHIVE.md",
  "docs/TEST-STRATEGY.md",
  "docs/SECURITY-OPERATIONS.md",
  "docs/IMPLEMENTATION-PLAN.md",
  "prompts/START-HERE.md",
  ".claude/skills/implement-phase/SKILL.md",
  ".claude/agents/scout.md",
  ".claude/agents/reviewer.md",
];

for (const file of required) if (!existsSync(join(root, file))) errors.push(`missing required file: ${file}`);

const phaseDir = join(root, "prompts/phases");
const phases = existsSync(phaseDir)
  ? readdirSync(phaseDir)
      .filter((name) => /^\d{2}-.+\.md$/.test(name))
      .sort()
  : [];
if (phases.length !== 28) errors.push(`expected 28 phase prompts, found ${phases.length}`);
for (let index = 0; index < 28; index += 1) {
  const prefix = String(index).padStart(2, "0") + "-";
  if (!phases.some((name) => name.startsWith(prefix))) errors.push(`missing phase ${prefix.slice(0, 2)}`);
}

// Generated, vendored and nested-worktree directories are not part of the kit.
const SKIP_DIRS = new Set(["node_modules", ".git", ".turbo", "dist", "coverage", "playwright-report", "test-results"]);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (SKIP_DIRS.has(name) || relative(root, path) === join(".claude", "worktrees")) return [];
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const agents = walk(join(root, ".claude/agents")).filter((path) => path.endsWith(".md"));
if (agents.length < 10) errors.push(`expected at least 10 agents, found ${agents.length}`);
for (const path of agents) {
  const text = readFileSync(path, "utf8");
  if (!text.startsWith("---\n") || !/\nname: [a-z0-9-]+\n/.test(text) || !/\ndescription: .+\n/.test(text)) {
    errors.push(`invalid agent frontmatter: ${relative(root, path)}`);
  }
}

const skillFiles = walk(join(root, ".claude/skills")).filter((path) => path.endsWith("SKILL.md"));
if (skillFiles.length < 8) errors.push(`expected at least 8 skills, found ${skillFiles.length}`);
for (const path of skillFiles) {
  const text = readFileSync(path, "utf8");
  if (!text.startsWith("---\n") || !/\nname: [a-z0-9-]+\n/.test(text) || !/\ndescription: .+\n/.test(text)) {
    errors.push(`invalid skill frontmatter: ${relative(root, path)}`);
  }
  if (text.length > 12000) errors.push(`skill is too large for progressive disclosure: ${relative(root, path)}`);
}

const invariantCorpus = ["README.md", "CLAUDE.md", "docs/PRODUCT.md", "docs/DOMAIN.md"]
  .map((file) => readFileSync(join(root, file), "utf8"))
  .join("\n");
for (const [label, pattern] of [
  ["10,000 initial NPCs", /10,?000/],
  ["1 CE", /1 CE/],
  ["2026 CE", /2026 CE/],
  ["30 real days", /30 real days|30-day/],
  ["subscriber count only targets population", /subscriber count.*population target|subscriber-derived target/is],
  ["append-only history", /append-only/],
  ["determinism", /deterministic|determinism/],
  ["Vue", /Vue/],
  ["Phaser", /Phaser/],
])
  if (!pattern.test(invariantCorpus)) errors.push(`missing invariant: ${label}`);

// Source code must not present unfinished work as functionality.
for (const path of walk(root).filter(
  (path) => /^(apps|packages)\//.test(relative(root, path)) && /\.(ts|vue)$/.test(path),
)) {
  const text = readFileSync(path, "utf8");
  if (/\b(TO[D]O|FIX[M]E|X{3})\b|not implemented/i.test(text))
    errors.push(`unfinished placeholder in source: ${relative(root, path)}`);
}

for (const path of walk(root).filter((path) => /\.(md|json|ya?ml|mjs)$/.test(path))) {
  const text = readFileSync(path, "utf8");
  if (/<TO[D]O>|\bT[B]D\b|LOREM IP[S]UM/i.test(text)) errors.push(`unfinished placeholder: ${relative(root, path)}`);
}

for (const path of walk(root).filter((path) => path.endsWith(".json"))) {
  try {
    JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`invalid JSON ${relative(root, path)}: ${error.message}`);
  }
}

if (errors.length) {
  console.error(`Starter verification failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Starter verification passed: ${phases.length} phases, ${agents.length} agents, ${skillFiles.length} skills.`,
);
