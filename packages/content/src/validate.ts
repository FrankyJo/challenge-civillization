import { NAME_APPLICABILITY, NAME_USAGES, type ContentPack, type NameEntry } from "@civ/contracts";

/** Content-level invariants beyond the schema (docs/POPULATION.md § Content). */
export class ContentValidationError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`invalid content pack: ${issues.slice(0, 5).join("; ")}`);
    this.name = "ContentValidationError";
    this.issues = issues;
  }
}

/** Every usage/applicability pair the population synthesis may ask for. */
export interface NameSlot {
  readonly usage: NameEntry["usage"];
  readonly applicability: NameEntry["applicability"];
}
export const REQUIRED_NAME_SLOTS: readonly NameSlot[] = NAME_USAGES.flatMap((usage): NameSlot[] =>
  usage === "given"
    ? NAME_APPLICABILITY.map((applicability) => ({ usage, applicability }))
    : [{ usage, applicability: "any" }],
);

export function contentPackIssues(pack: ContentPack): string[] {
  const issues: string[] = [];
  const share = pack.cultures.reduce((sum, culture) => sum + culture.seedSharePpm, 0);
  if (share !== 1_000_000) issue(`culture seed shares sum to ${share} ppm, not 1,000,000`);
  const datasets = new Map(pack.nameDatasets.map((dataset) => [dataset.datasetId, dataset]));
  if (datasets.size !== pack.nameDatasets.length) issue("dataset IDs must be unique");
  const cultures = new Set<string>();
  const citations = new Set(pack.citations.map((citation) => citation.sourceId));
  function issue(message: string) {
    issues.push(message);
  }
  for (const dataset of pack.nameDatasets) {
    const ids = new Set<string>();
    const forms = new Set<string>();
    for (const entry of dataset.entries) {
      if (ids.has(entry.entryId)) issue(`${dataset.datasetId}: duplicate entry ${entry.entryId}`);
      ids.add(entry.entryId);
      const key = `${entry.usage}:${entry.form}`;
      if (forms.has(key)) issue(`${dataset.datasetId}: duplicate ${entry.usage} form ${entry.form}`);
      forms.add(key);
    }
  }
  for (const culture of pack.cultures) {
    if (cultures.has(culture.cultureId)) issue(`duplicate culture ${culture.cultureId}`);
    cultures.add(culture.cultureId);
    const chain = culture.naming.datasets.map((id) => datasets.get(id));
    chain.forEach((dataset, index) => {
      if (dataset === undefined) issue(`${culture.cultureId}: unknown dataset ${culture.naming.datasets[index]}`);
    });
    if (chain[0] !== undefined && chain[0].languageId !== culture.languageId) {
      issue(`${culture.cultureId}: its primary dataset is not in its language`);
    }
    // The last dataset of every chain must answer every request for any
    // birth year: an open-era entry for every usage and applicability.
    const last = chain.at(-1);
    if (last !== undefined) {
      for (const { usage, applicability } of REQUIRED_NAME_SLOTS) {
        const covered = last.entries.some(
          (entry) =>
            entry.usage === usage &&
            entry.applicability === applicability &&
            entry.eraFrom === null &&
            entry.eraTo === null,
        );
        if (!covered)
          issue(`${culture.cultureId}: fallback ${last.datasetId} lacks an open-era ${usage}/${applicability} name`);
      }
    }
    const { female, male } = culture.household.marriageAge;
    if (female.max >= 50 || male.min < 14) issue(`${culture.cultureId}: implausible marriage ages`);
    const forms = culture.household.formWeights;
    if (forms.nuclear + forms.stem + forms.joint + forms.solitary + forms.kin_care === 0) {
      issue(`${culture.cultureId}: all household form weights are zero`);
    }
  }
  for (const id of pack.demography.citations) {
    if (!citations.has(id)) issue(`demography cites unknown source ${id}`);
  }
  return issues;
}

export function assertValidContentPack(pack: ContentPack): void {
  const issues = contentPackIssues(pack);
  if (issues.length > 0) throw new ContentValidationError(issues);
}
