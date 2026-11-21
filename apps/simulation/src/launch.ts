import {
  worldDataSchema,
  parseContract,
  type Actor,
  type ContentPack,
  type Digest,
  type MapParams,
  type PopulationParams,
  type SeedPopulation,
  type WorldData,
  type WorldMap,
  type WorldRecord,
} from "@civ/contracts";
import { SEASON_ONE_CONTENT_VERSION, SEASON_ONE_PACK } from "@civ/content";
import { canonicalDigest, createWorld, LedgerIntegrityError, loadWorldPopulation, type Pool } from "@civ/db";
import {
  createEngine,
  POPULATION_GENERATOR,
  populationReport,
  SEASON_ONE_SPAN,
  seedPopulation,
  validatePopulation,
  type Engine,
  type PopulationReport,
  type SystemSchedule,
} from "@civ/domain";
import { prepareGeography, type PreparedGeography } from "./geography.js";

export interface LaunchWorldInput {
  readonly pool: Pool;
  readonly worldId: string;
  readonly name: string;
  readonly seed: string;
  readonly createdAt: string;
  readonly createdBy: Actor;
  readonly correlationId: string;
  readonly schedule: SystemSchedule<WorldData>;
  readonly mapParams?: MapParams;
  readonly populationParams?: PopulationParams;
  /** Content pack and its version; season one by default. */
  readonly pack?: ContentPack;
  readonly contentVersion?: Digest;
}

export interface LaunchedWorld {
  readonly engine: Engine<WorldData>;
  readonly geography: PreparedGeography;
  readonly population: SeedPopulation;
  readonly populationHash: Digest;
  readonly report: PopulationReport;
}

/**
 * Launch a world: generate its map, synthesize its seed population of
 * exactly `populationParams.size` people, build the engine bound to that map
 * and content, and store world, map, population and initial state in one
 * transaction. The initial state names the population by hash.
 */
export async function launchWorld(input: LaunchWorldInput): Promise<LaunchedWorld> {
  const pack = input.pack ?? SEASON_ONE_PACK;
  const contentVersion = input.contentVersion ?? SEASON_ONE_CONTENT_VERSION;
  const geography = prepareGeography({
    worldId: input.worldId,
    seed: input.seed,
    ...(input.mapParams === undefined ? {} : { params: input.mapParams }),
  });
  const { population, populationHash } = seedPopulation({
    worldId: input.worldId,
    seed: input.seed,
    map: geography.map,
    pack,
    contentVersion,
    ...(input.populationParams === undefined ? {} : { params: input.populationParams }),
  });
  const engine = createEngine<WorldData>({
    worldId: input.worldId,
    seed: input.seed,
    span: SEASON_ONE_SPAN,
    contentVersion,
    schedule: input.schedule,
    geography: geography.reference,
  });
  const data: WorldData = { schemaVersion: 1, seedPopulationHash: populationHash };
  const initial = engine.initialState(data);
  const world: WorldRecord = {
    schemaVersion: 1,
    worldId: input.worldId as WorldRecord["worldId"],
    name: input.name,
    seed: input.seed,
    startYear: SEASON_ONE_SPAN.startYear,
    endYear: SEASON_ONE_SPAN.endYear,
    versions: engine.versions,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  };
  await createWorld(input.pool, {
    world,
    initialState: initial,
    stateHash: canonicalDigest(initial),
    checkpoint: engine.checkpoint(initial),
    map: { document: geography.map, snapshot: geography.snapshot },
    population: { population, populationHash },
    correlationId: input.correlationId,
  });
  return { engine, geography, population, populationHash, report: populationReport(population) };
}

/**
 * Load a world's seed population for the engine. Checks, in order: the
 * store's hash verification, that the world state names this population
 * (`data.seedPopulationHash`), the domain's semantic audit against the
 * world's map and content, and — when this build's generator produced it —
 * that re-synthesizing yields the same hash.
 */
export async function loadSeedPopulation(input: {
  readonly pool: Pool;
  readonly worldId: string;
  readonly seed: string;
  readonly data: unknown;
  readonly map: WorldMap;
  readonly pack?: ContentPack;
  readonly contentVersion?: Digest;
  readonly generatorVersion?: string;
}): Promise<{ readonly population: SeedPopulation; readonly populationHash: Digest; readonly regenerated: boolean }> {
  const pack = input.pack ?? SEASON_ONE_PACK;
  const data = parseContract("world data", worldDataSchema, input.data);
  const { population, populationHash } = await loadWorldPopulation(input.pool, input.worldId);
  if (data.seedPopulationHash !== populationHash) {
    throw new LedgerIntegrityError(`world ${input.worldId} state names another seed population`);
  }
  const audit = validatePopulation(population, { map: input.map, pack });
  if (!audit.ok) {
    throw new LedgerIntegrityError(
      `stored seed population of ${input.worldId} is invalid: ${audit.issues.slice(0, 3).join("; ")}`,
    );
  }
  let regenerated = false;
  if ((input.generatorVersion ?? POPULATION_GENERATOR.version) === POPULATION_GENERATOR.version) {
    const again = seedPopulation({
      worldId: input.worldId,
      seed: input.seed,
      map: input.map,
      pack,
      contentVersion: input.contentVersion ?? population.contentVersion,
      params: population.params,
    });
    if (again.populationHash !== populationHash) {
      throw new LedgerIntegrityError(`seed population of ${input.worldId} does not reproduce`);
    }
    regenerated = true;
  }
  return { population, populationHash, regenerated };
}
