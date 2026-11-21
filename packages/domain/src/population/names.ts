import {
  type ContentPack,
  type Culture,
  type DatasetNameSource,
  type NameDataset,
  type NameEntry,
} from "@civ/contracts";
import { type RandomStream } from "../random.js";

export type Applicability = NameEntry["applicability"];

/** Is the entry in use in an (astronomical) year? */
export function entryInEra(entry: NameEntry, year: number): boolean {
  return (entry.eraFrom === null || entry.eraFrom <= year) && (entry.eraTo === null || year <= entry.eraTo);
}

/** Entries a request may draw from at one dataset: exact applicability plus "any". */
export function eligibleEntries(
  dataset: NameDataset,
  usage: NameEntry["usage"],
  applicability: Applicability,
  year: number,
  untilYear = year,
): NameEntry[] {
  return dataset.entries.filter(
    (entry) =>
      entry.usage === usage &&
      (entry.applicability === applicability || entry.applicability === "any") &&
      entryInEra(entry, year) &&
      entryInEra(entry, untilYear),
  );
}

export interface SampledName {
  readonly entry: NameEntry;
  readonly source: DatasetNameSource;
}

/**
 * Deterministic weighted name sampling with the culture's fallback chain:
 * the first dataset in `culture.naming.datasets` that has an eligible entry
 * (usage, applicability or "any", era containing the year — or every year
 * up to `untilYear` for names shared by people born in different years) is used, and its
 * position is recorded as `fallbackLevel`. Entries in `avoid` are skipped
 * when an alternative exists at the same level; avoidance never causes a
 * fallback to the next dataset.
 */
export class NameSampler {
  readonly #datasets: ReadonlyMap<string, NameDataset>;

  constructor(pack: ContentPack) {
    this.#datasets = new Map(pack.nameDatasets.map((dataset) => [dataset.datasetId, dataset]));
  }

  chain(culture: Culture): NameDataset[] {
    return culture.naming.datasets.map((id) => {
      const dataset = this.#datasets.get(id);
      if (dataset === undefined) throw new Error(`culture ${culture.cultureId} names unknown dataset ${id}`);
      return dataset;
    });
  }

  sample(
    culture: Culture,
    usage: NameEntry["usage"],
    applicability: Applicability,
    year: number,
    random: RandomStream,
    avoid: ReadonlySet<string> = new Set(),
    untilYear = year,
  ): SampledName {
    const chain = this.chain(culture);
    for (let level = 0; level < chain.length; level += 1) {
      const dataset = chain[level] as NameDataset;
      const eligible = eligibleEntries(dataset, usage, applicability, year, untilYear);
      if (eligible.length === 0) continue;
      const fresh = eligible.filter((entry) => !avoid.has(`${dataset.datasetId}/${entry.entryId}`));
      const pool = fresh.length > 0 ? fresh : eligible;
      const entry = pool[random.weightedIndex(pool.map((candidate) => candidate.weight))] as NameEntry;
      return {
        entry,
        source: { dataset: dataset.datasetId, version: dataset.version, entryId: entry.entryId, fallbackLevel: level },
      };
    }
    throw new Error(
      `no ${usage}/${applicability} name for ${culture.cultureId} in year ${year}: the fallback chain is incomplete`,
    );
  }

  /** The entry a dataset source points to, or undefined. */
  resolve(source: DatasetNameSource): NameEntry | undefined {
    const dataset = this.#datasets.get(source.dataset);
    if (dataset === undefined || dataset.version !== source.version) return undefined;
    return dataset.entries.find((entry) => entry.entryId === source.entryId);
  }
}

/** Capitalise a normalised name form for display. */
export function displayForm(form: string): string {
  return form.length === 0 ? form : `${form.charAt(0).toUpperCase()}${form.slice(1)}`;
}
