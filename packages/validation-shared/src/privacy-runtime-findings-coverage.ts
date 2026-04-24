import process from "node:process";
import {
  PRIVACY_RUNTIME_FINDINGS_DATASET_SEED,
  PRIVACY_RUNTIME_FINDING_GROUPS,
  type PrivacyRuntimeFindingDatasetExample,
  summarizePrivacyRuntimeFindingsDataset
} from "./privacy-runtime-findings.dataset";

type CountEntry = {
  count: number;
  key: string;
};

export type PrivacyRuntimeFindingsCoverageSnapshot = ReturnType<typeof summarizePrivacyRuntimeFindingsDataset> & {
  gapSummary: string[];
  groupScenarioMatrix: Array<{
    group: string;
    scenarios: CountEntry[];
    total: number;
  }>;
};

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toSortedCountEntries(map: Map<string, number>) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function buildGroupScenarioMatrix(examples: PrivacyRuntimeFindingDatasetExample[]) {
  return PRIVACY_RUNTIME_FINDING_GROUPS.map((group) => {
    const counts = new Map<string, number>();
    for (const example of examples) {
      if (example.findingGroup === group) {
        incrementCount(counts, example.scenarioType);
      }
    }

    return {
      group,
      scenarios: toSortedCountEntries(counts),
      total: [...counts.values()].reduce((sum, value) => sum + value, 0)
    };
  });
}

function getCount(entries: CountEntry[], key: string) {
  return entries.find((entry) => entry.key === key)?.count ?? 0;
}

function buildGapSummary(snapshot: PrivacyRuntimeFindingsCoverageSnapshot) {
  const gaps: string[] = [];

  for (const entry of snapshot.groupScenarioMatrix) {
    if (entry.total === 0) {
      continue;
    }

    const positiveCount =
      getCount(entry.scenarios, "positive_high_confidence") + getCount(entry.scenarios, "positive_moderate");
    const negativeCount = getCount(entry.scenarios, "negative_control");
    const borderlineCount = getCount(entry.scenarios, "borderline_review") + getCount(entry.scenarios, "borderline_audit_only");
    const borderlineRatio = entry.total > 0 ? borderlineCount / entry.total : 0;

    if (entry.total < 30) {
      gaps.push(`${entry.group}: fewer than 30 seed examples`);
    }
    if (negativeCount < positiveCount) {
      gaps.push(`${entry.group}: fewer negatives than positives`);
    }
    if (borderlineRatio < 0.2) {
      gaps.push(`${entry.group}: borderline examples below 20%`);
    }
  }

  if (snapshot.currentExampleCount < 180) {
    gaps.push("dataset: fewer than 180 seed examples");
  }
  if (snapshot.negativeCount < snapshot.positiveCount) {
    gaps.push("dataset: fewer total negatives than positives");
  }
  if (snapshot.borderlineCount / snapshot.currentExampleCount < 0.2) {
    gaps.push("dataset: borderline examples below 20%");
  }

  return gaps;
}

export function summarizePrivacyRuntimeFindingsCoverage(
  examples: PrivacyRuntimeFindingDatasetExample[] = PRIVACY_RUNTIME_FINDINGS_DATASET_SEED
): PrivacyRuntimeFindingsCoverageSnapshot {
  const summary = summarizePrivacyRuntimeFindingsDataset(examples);
  const snapshot: PrivacyRuntimeFindingsCoverageSnapshot = {
    ...summary,
    gapSummary: [],
    groupScenarioMatrix: buildGroupScenarioMatrix(examples)
  };
  snapshot.gapSummary = buildGapSummary(snapshot);
  return snapshot;
}

function renderCountEntries(entries: CountEntry[]) {
  return entries.map((entry) => `- ${entry.key}: ${entry.count}`).join("\n");
}

function renderRecordCounts(record: Record<string, number>) {
  return renderCountEntries(toSortedCountEntries(new Map(Object.entries(record))));
}

function renderGroupScenarioMatrix(entries: PrivacyRuntimeFindingsCoverageSnapshot["groupScenarioMatrix"]) {
  return entries
    .map((entry) => `### ${entry.group}\n${renderCountEntries(entry.scenarios)}`)
    .join("\n\n");
}

export function renderPrivacyRuntimeFindingsCoverageMarkdown(
  snapshot: PrivacyRuntimeFindingsCoverageSnapshot = summarizePrivacyRuntimeFindingsCoverage()
) {
  return [
    "# Privacy Runtime Findings Corpus Coverage",
    "",
    `Current examples: ${snapshot.currentExampleCount}`,
    "",
    "## Finding Groups",
    renderRecordCounts(snapshot.groupCounts),
    "",
    "## Scenario Types",
    renderRecordCounts(snapshot.scenarioCounts),
    "",
    "## Source Kinds",
    renderRecordCounts(snapshot.sourceKindCounts),
    "",
    "## Expected Presentations",
    renderRecordCounts(snapshot.expectedPresentationCounts),
    "",
    "## Expected Confidence",
    renderRecordCounts(snapshot.expectedConfidenceCounts),
    "",
    "## Finding IDs",
    renderRecordCounts(snapshot.findingCounts),
    "",
    "## Group Scenario Matrix",
    renderGroupScenarioMatrix(snapshot.groupScenarioMatrix),
    "",
    "## Suggested Gaps",
    snapshot.gapSummary.length > 0 ? snapshot.gapSummary.map((entry) => `- ${entry}`).join("\n") : "- none"
  ].join("\n");
}

function printCoverageReport() {
  const wantsJson = process.argv.includes("--json");
  const snapshot = summarizePrivacyRuntimeFindingsCoverage();

  if (wantsJson) {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${renderPrivacyRuntimeFindingsCoverageMarkdown(snapshot)}\n`);
}

if (require.main === module) {
  printCoverageReport();
}
