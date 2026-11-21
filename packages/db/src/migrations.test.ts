import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checksum, loadMigrations, MigrationError } from "./migrations.js";

async function dirWith(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "civ-migrations-"));
  await Promise.all(Object.entries(files).map(([name, sql]) => writeFile(join(dir, name), sql)));
  return dir;
}

describe("checksum", () => {
  it("ignores line-ending style but detects edits to either script", () => {
    expect(checksum("A\r\nB", "C")).toBe(checksum("A\nB", "C"));
    expect(checksum("A", "C")).not.toBe(checksum("A", "D"));
    expect(checksum("AB", "")).not.toBe(checksum("A", "B"));
  });
});

describe("loadMigrations", () => {
  it("loads the shipped migrations", async () => {
    const migrations = await loadMigrations();
    expect(migrations.map((m) => `${m.version}:${m.name}`)).toEqual([
      "1:baseline",
      "2:authoritative_store",
      "3:world_status_projection",
    ]);
    expect(migrations[0]?.checksum).toBe(checksum(migrations[0]?.up ?? "", migrations[0]?.down ?? ""));
  });

  it("orders by version and pairs up/down", async () => {
    const dir = await dirWith({
      "0002_second.up.sql": "SELECT 2",
      "0001_first.up.sql": "SELECT 1",
      "0002_second.down.sql": "SELECT -2",
      "0001_first.down.sql": "SELECT -1",
    });
    const migrations = await loadMigrations(dir);
    expect(migrations.map((m) => [m.version, m.name, m.up, m.down])).toEqual([
      [1, "first", "SELECT 1", "SELECT -1"],
      [2, "second", "SELECT 2", "SELECT -2"],
    ]);
  });

  it.each([
    [{ "0001_a.up.sql": "x" }, /needs both/],
    [{ "0001_a.up.sql": "x", "0001_a.down.sql": "x", "0003_c.up.sql": "x", "0003_c.down.sql": "x" }, /contiguous/],
    [{ "0001_a.up.sql": "x", "0001_b.down.sql": "x" }, /conflicting names/],
    [{ "0001_a.up.sql": "x", "0001_a.down.sql": "x", "notes.txt": "x" }, /unexpected file/],
    [{ "1_a.up.sql": "x" }, /unexpected file/],
  ])("rejects invalid layout %#", async (files, message) => {
    await expect(loadMigrations(await dirWith(files))).rejects.toThrow(message);
    await expect(loadMigrations(await dirWith(files))).rejects.toBeInstanceOf(MigrationError);
  });
});
