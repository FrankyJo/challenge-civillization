import { parseContract, seedPopulationSchema, worldIdSchema, type Digest, type SeedPopulation } from "@civ/contracts";
import { canonicalDigest } from "./digest.js";
import { LedgerIntegrityError, NotFoundError } from "./errors.js";
import { type Queryable } from "./transaction.js";

/** A world's seed population with its canonical hash, as stored. */
export interface StoredPopulation {
  readonly population: SeedPopulation;
  readonly populationHash: Digest;
}

/**
 * Verify a seed population: contract shape and the hash recomputed with
 * node:crypto (the domain computes it with its own SHA-256). Semantic
 * validation (kinship, guardianship, names) is the domain's job and runs at
 * synthesis and on load in the simulation.
 */
export function verifyPopulation(input: StoredPopulation, label: string): StoredPopulation {
  const population = parseContract(`${label}`, seedPopulationSchema, input.population);
  const actual = canonicalDigest(input.population);
  if (actual !== input.populationHash) {
    throw new LedgerIntegrityError(
      `${label}: hash ${input.populationHash} does not match its canonical digest ${actual}`,
    );
  }
  return { population, populationHash: input.populationHash };
}

export async function insertWorldPopulation(client: Queryable, stored: StoredPopulation): Promise<void> {
  const { population, populationHash } = stored;
  await client.query(
    `INSERT INTO civ.world_populations
       (world_id, schema_version, population_hash, content_version, map_hash, living, document)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      population.worldId,
      population.schemaVersion,
      populationHash,
      population.contentVersion,
      population.mapHash,
      population.persons.length,
      JSON.stringify(population),
    ],
  );
}

/** Load a world's seed population, hash-verified. */
export async function loadWorldPopulation(db: Queryable, worldId: string): Promise<StoredPopulation> {
  parseContract("world id", worldIdSchema, worldId);
  const result = await db.query<{ document: unknown; population_hash: string }>(
    "SELECT document, population_hash FROM civ.world_populations WHERE world_id = $1",
    [worldId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new NotFoundError(`world ${worldId} has no seed population`);
  const stored = verifyPopulation(
    { population: row.document as SeedPopulation, populationHash: row.population_hash as Digest },
    `seed population of ${worldId}`,
  );
  if (stored.population.worldId !== worldId)
    throw new LedgerIntegrityError(`population row of ${worldId} names another world`);
  return stored;
}
