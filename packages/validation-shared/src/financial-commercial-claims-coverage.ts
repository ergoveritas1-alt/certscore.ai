import process from "node:process";
import type { FinancialCommercialClaimClassification } from "./financial-commercial-claims";
import type {
  FinancialCommercialClaimsDatasetBucket,
  FinancialCommercialClaimsDatasetExample,
  FinancialCommercialClaimsEmittableFindingId
} from "./financial-commercial-claims.dataset";
import {
  FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED,
  summarizeFinancialCommercialClaimsDataset
} from "./financial-commercial-claims.dataset";

type CountEntry = {
  count: number;
  key: string;
};

export type FinancialCommercialClaimsCoverageSnapshot = {
  bucketCounts: CountEntry[];
  currentExampleCount: number;
  findingCounts: CountEntry[];
  gapSummary: string[];
  pageTypeByClaimType: Array<{
    claimType: FinancialCommercialClaimClassification["claimType"];
    pageTypes: CountEntry[];
    total: number;
  }>;
  pageTypeCounts: CountEntry[];
  positivePageTypeByFindingId: Array<{
    findingId: FinancialCommercialClaimsEmittableFindingId;
    pageTypes: CountEntry[];
    total: number;
  }>;
  splitCounts: CountEntry[];
};

const CORE_PAGE_TYPES = [
  "homepage",
  "marketing_page",
  "pricing_page",
  "lead_generation_offer",
  "financial_offer"
] as const;

const EMITTABLE_FINDING_IDS: FinancialCommercialClaimsEmittableFindingId[] = [
  "simulated_performance_without_disclosure",
  "unqualified_superlative_claim_detected",
  "financial_urgency_pressure_tactic_detected"
];

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toSortedCountEntries(map: Map<string, number>) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function getDatasetPageType(example: FinancialCommercialClaimsDatasetExample) {
  return example.input.pageType?.trim() || "unknown";
}

function buildPageTypeCountMap(examples: FinancialCommercialClaimsDatasetExample[]) {
  const counts = new Map<string, number>();

  for (const example of examples) {
    incrementCount(counts, getDatasetPageType(example));
  }

  return counts;
}

function buildPageTypeByClaimTypeMatrix(examples: FinancialCommercialClaimsDatasetExample[]) {
  const grouped = new Map<FinancialCommercialClaimClassification["claimType"], Map<string, number>>();

  for (const example of examples) {
    const claimType = example.expected.claimType;
    const pageType = getDatasetPageType(example);

    if (!grouped.has(claimType)) {
      grouped.set(claimType, new Map());
    }

    incrementCount(grouped.get(claimType)!, pageType);
  }

  return [...grouped.entries()]
    .map(([claimType, counts]) => ({
      claimType,
      pageTypes: toSortedCountEntries(counts),
      total: [...counts.values()].reduce((sum, value) => sum + value, 0)
    }))
    .sort((left, right) => right.total - left.total || left.claimType.localeCompare(right.claimType));
}

function buildPositiveFindingPageTypeMatrix(examples: FinancialCommercialClaimsDatasetExample[]) {
  const positiveExamples = examples.filter((example) => example.pageExpectation.expectedFindingIds.length > 0);
  const grouped = new Map<FinancialCommercialClaimsEmittableFindingId, Map<string, number>>();

  for (const findingId of EMITTABLE_FINDING_IDS) {
    grouped.set(findingId, new Map());
  }

  for (const example of positiveExamples) {
    const pageType = getDatasetPageType(example);

    for (const findingId of example.pageExpectation.expectedFindingIds) {
      if (!grouped.has(findingId)) {
        continue;
      }
      incrementCount(grouped.get(findingId)!, pageType);
    }
  }

  return EMITTABLE_FINDING_IDS.map((findingId) => {
    const counts = grouped.get(findingId)!;
    return {
      findingId,
      pageTypes: toSortedCountEntries(counts),
      total: [...counts.values()].reduce((sum, value) => sum + value, 0)
    };
  });
}

function buildGapSummary(snapshot: FinancialCommercialClaimsCoverageSnapshot) {
  const gapSummary: string[] = [];
  const findingPageTypes = new Map(
    snapshot.positivePageTypeByFindingId.map((entry) => [entry.findingId, new Map(entry.pageTypes.map((item) => [item.key, item.count]))])
  );
  const bucketCounts = new Map(snapshot.bucketCounts.map((entry) => [entry.key, entry.count]));

  for (const findingId of EMITTABLE_FINDING_IDS) {
    const counts = findingPageTypes.get(findingId) ?? new Map<string, number>();
    const missingPageTypes = CORE_PAGE_TYPES.filter((pageType) => !counts.has(pageType));
    const thinPageTypes = CORE_PAGE_TYPES.filter((pageType) => (counts.get(pageType) ?? 0) === 1);

    if (missingPageTypes.length > 0) {
      gapSummary.push(`${findingId}: missing ${missingPageTypes.join(", ")}`);
    }
    if (thinPageTypes.length > 0) {
      gapSummary.push(`${findingId}: only one example in ${thinPageTypes.join(", ")}`);
    }
  }

  if ((bucketCounts.get("negative_nonfinancial") ?? 0) < 5) {
    gapSummary.push("negative_nonfinancial: fewer than 5 examples; add finance-adjacent non-trigger controls");
  }
  if ((bucketCounts.get("positive_borderline") ?? 0) < 5) {
    gapSummary.push("positive_borderline: fewer than 5 examples; add ambiguous disclosure and mixed-context positives");
  }

  return gapSummary;
}

export function summarizeFinancialCommercialClaimsCoverage(
  examples: FinancialCommercialClaimsDatasetExample[] = FINANCIAL_COMMERCIAL_CLAIMS_DATASET_SEED
): FinancialCommercialClaimsCoverageSnapshot {
  const datasetSummary = summarizeFinancialCommercialClaimsDataset(examples);
  const bucketCounts = toSortedCountEntries(
    new Map(Object.entries(datasetSummary.bucketCounts as Record<FinancialCommercialClaimsDatasetBucket, number>))
  );
  const splitCounts = toSortedCountEntries(
    new Map([
      ["train", datasetSummary.trainCount],
      ["eval", datasetSummary.evalCount]
    ])
  );
  const findingCounts = toSortedCountEntries(
    new Map(Object.entries(datasetSummary.emittableFindingCounts as Record<FinancialCommercialClaimsEmittableFindingId, number>))
  );
  const pageTypeCounts = toSortedCountEntries(buildPageTypeCountMap(examples));
  const pageTypeByClaimType = buildPageTypeByClaimTypeMatrix(examples);
  const positivePageTypeByFindingId = buildPositiveFindingPageTypeMatrix(examples);

  const snapshot: FinancialCommercialClaimsCoverageSnapshot = {
    bucketCounts,
    currentExampleCount: examples.length,
    findingCounts,
    gapSummary: [],
    pageTypeByClaimType,
    pageTypeCounts,
    positivePageTypeByFindingId,
    splitCounts
  };

  snapshot.gapSummary = buildGapSummary(snapshot);
  return snapshot;
}

function renderCountEntries(entries: CountEntry[]) {
  return entries.map((entry) => `- ${entry.key}: ${entry.count}`).join("\n");
}

function renderFindingPageTypeSection(
  entries: FinancialCommercialClaimsCoverageSnapshot["positivePageTypeByFindingId"]
) {
  return entries
    .map((entry) => {
      const counts = entry.pageTypes.length > 0 ? renderCountEntries(entry.pageTypes) : "- none";
      return `### ${entry.findingId}\n${counts}`;
    })
    .join("\n\n");
}

function renderClaimMatrixSection(entries: FinancialCommercialClaimsCoverageSnapshot["pageTypeByClaimType"]) {
  return entries
    .map((entry) => {
      const counts = renderCountEntries(entry.pageTypes);
      return `### ${entry.claimType}\n${counts}`;
    })
    .join("\n\n");
}

export function renderFinancialCommercialClaimsCoverageMarkdown(
  snapshot: FinancialCommercialClaimsCoverageSnapshot = summarizeFinancialCommercialClaimsCoverage()
) {
  return [
    "# Financial Claims Corpus Coverage",
    "",
    `Current examples: ${snapshot.currentExampleCount}`,
    "",
    "## Dataset Buckets",
    renderCountEntries(snapshot.bucketCounts),
    "",
    "## Split Coverage",
    renderCountEntries(snapshot.splitCounts),
    "",
    "## Page Types",
    renderCountEntries(snapshot.pageTypeCounts),
    "",
    "## Emittable Finding Coverage",
    renderCountEntries(snapshot.findingCounts),
    "",
    "## Positive Finding Page-Type Matrix",
    renderFindingPageTypeSection(snapshot.positivePageTypeByFindingId),
    "",
    "## Claim-Type Page-Type Matrix",
    renderClaimMatrixSection(snapshot.pageTypeByClaimType),
    "",
    "## Suggested Gaps",
    snapshot.gapSummary.length > 0 ? snapshot.gapSummary.map((entry) => `- ${entry}`).join("\n") : "- none"
  ].join("\n");
}

function printCoverageReport() {
  const wantsJson = process.argv.includes("--json");
  const snapshot = summarizeFinancialCommercialClaimsCoverage();

  if (wantsJson) {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${renderFinancialCommercialClaimsCoverageMarkdown(snapshot)}\n`);
}

if (require.main === module) {
  printCoverageReport();
}
