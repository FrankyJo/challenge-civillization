import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

test("contains one prompt for every phase 00 through 27", () => {
  const files = readdirSync(resolve(root, "prompts/phases")).filter((name) => /^\d{2}-.*\.md$/.test(name));
  assert.equal(files.length, 28);
  for (let phase = 0; phase <= 27; phase += 1) {
    const prefix = String(phase).padStart(2, "0") + "-";
    assert.ok(
      files.some((name) => name.startsWith(prefix)),
      `missing ${prefix}`,
    );
  }
});

test("standing instructions stay concise and carry core invariants", () => {
  const claude = readFileSync(resolve(root, "CLAUDE.md"), "utf8");
  assert.ok(claude.split("\n").length < 200);
  for (const pattern of [/10,000/, /1 CE/, /2026 CE/, /30 real days/, /append-only/, /subscriber/i, /determin/]) {
    assert.match(claude, pattern);
  }
});

test("all declared agent skills exist", () => {
  const agentDir = resolve(root, ".claude/agents");
  for (const file of readdirSync(agentDir).filter((name) => name.endsWith(".md"))) {
    const text = readFileSync(resolve(agentDir, file), "utf8");
    const block = text.match(/\nskills:\n((?:\s+- .+\n)+)/)?.[1] ?? "";
    for (const name of [...block.matchAll(/\s+- ([a-z0-9-]+)/g)].map((match) => match[1])) {
      assert.ok(existsSync(resolve(root, `.claude/skills/${name}/SKILL.md`)), `${file} references missing ${name}`);
    }
  }
});

test("starter does not claim the complete game is implemented", () => {
  const readme = readFileSync(resolve(root, "README.md"), "utf8");
  assert.match(readme, /does \*\*not\*\* pretend that the full game is already implemented/);
});
