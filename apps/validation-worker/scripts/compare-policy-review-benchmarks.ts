import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  POLICY_REVIEW_TOPIC_DEFINITIONS,
  type PolicyReviewStatus,
  type PolicyReviewTopic
} from "@certscore/contracts";
import { POLICY_REVIEW_EVALUATION_TOPICS } from "../src/validation/model-review-evaluation";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

type Decision = {
  confidence: number | null;
  rationale: string | null;
  status: PolicyReviewStatus;
};

type CaseArtifact = {
  caseId: string;
  decisions: Record<PolicyReviewTopic, Decision>;
  executionProvenance: string;
};

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
}

function parseDecisions(
  artifact: Record<string, unknown>
): Record<PolicyReviewTopic, Decision> | null {
  const modelArtifact =
    artifact.modelArtifact &&
    typeof artifact.modelArtifact === "object" &&
    !Array.isArray(artifact.modelArtifact)
      ? artifact.modelArtifact as Record<string, unknown>
      : null;
  if (modelArtifact?.status === "completed" && Array.isArray(modelArtifact.rows)) {
    return Object.fromEntries(
      modelArtifact.rows.map((row) => {
        const value = row as Record<string, unknown>;
        return [
          value.topic,
          {
            confidence:
              typeof value.confidence === "number" ? value.confidence : null,
            rationale:
              typeof value.rationale === "string" ? value.rationale : null,
            status: value.status
          }
        ];
      })
    ) as Record<PolicyReviewTopic, Decision>;
  }
  if (
    artifact.decisions &&
    typeof artifact.decisions === "object" &&
    !Array.isArray(artifact.decisions)
  ) {
    return Object.fromEntries(
      Object.entries(artifact.decisions as Record<string, unknown>).map(
        ([topic, rawDecision]) => {
          const decision = rawDecision as Record<string, unknown>;
          return [
            topic,
            {
              confidence:
                typeof decision.confidence === "number"
                  ? decision.confidence
                  : null,
              rationale:
                typeof decision.rationale === "string"
                  ? decision.rationale
                  : null,
              status: decision.status
            }
          ];
        }
      )
    ) as Record<PolicyReviewTopic, Decision>;
  }
  return null;
}

async function loadCaseArtifact(input: {
  caseId: string;
  directory: string;
  label: string;
}): Promise<CaseArtifact> {
  const primary = await readJson(path.join(input.directory, `${input.caseId}.json`));
  let decisions = parseDecisions(primary);
  let executionProvenance = input.label;
  if (!decisions) {
    const fallback = await readJson(
      path.join(
        input.directory,
        `${input.caseId}.codex-agent-fallback.json`
      )
    );
    decisions = parseDecisions(fallback);
    executionProvenance =
      typeof fallback.executionProvenance === "string"
        ? fallback.executionProvenance
        : `${input.label}_fallback`;
  }
  if (!decisions) {
    throw new Error(`No completed decisions found for ${input.label}/${input.caseId}.`);
  }
  return {
    caseId: input.caseId,
    decisions,
    executionProvenance
  };
}

function renderMarkdown(comparison: {
  byTopic: Record<
    PolicyReviewTopic,
    { agreementCount: number; disagreementCount: number }
  >;
  caseCount: number;
  cases: Array<{
    caseId: string;
    disagreements: Array<{
      left: Decision;
      right: Decision;
      topic: PolicyReviewTopic;
    }>;
  }>;
  leftLabel: string;
  rightLabel: string;
  rowAgreementRate: number;
  rowCount: number;
}) {
  const lines = [
    "# Policy-review model discrepancy worklist",
    "",
    "Internal evaluation artifact only. It is not customer-facing or production eligible.",
    "",
    `- Lanes: ${comparison.leftLabel} vs ${comparison.rightLabel}`,
    `- Cases: ${comparison.caseCount}`,
    `- Rows: ${comparison.rowCount}`,
    `- Exact row agreement: ${(comparison.rowAgreementRate * 100).toFixed(1)}%`,
    "",
    "## Agreement by topic",
    "",
    "| Topic | Agree | Disagree |",
    "| --- | ---: | ---: |",
    ...POLICY_REVIEW_EVALUATION_TOPICS.map((topic) => {
      const metrics = comparison.byTopic[topic];
      return `| ${POLICY_REVIEW_TOPIC_DEFINITIONS[topic].displayLabel} | ${metrics.agreementCount} | ${metrics.disagreementCount} |`;
    }),
    "",
    "## Human adjudication queue",
    ""
  ];
  for (const entry of comparison.cases.filter(
    (candidate) => candidate.disagreements.length > 0
  )) {
    lines.push(
      `### ${entry.caseId}`,
      "",
      `| Topic | ${comparison.leftLabel} | ${comparison.rightLabel} |`,
      "| --- | --- | --- |",
      ...entry.disagreements.map(
        (difference) =>
          `| ${POLICY_REVIEW_TOPIC_DEFINITIONS[difference.topic].displayLabel} | ${difference.left.status} | ${difference.right.status} |`
      ),
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const leftDirValue = getArgValue("--left-dir");
  const rightDirValue = getArgValue("--right-dir");
  const leftLabel = getArgValue("--left-label");
  const rightLabel = getArgValue("--right-label");
  const outValue = getArgValue("--out");
  if (!leftDirValue || !rightDirValue || !leftLabel || !rightLabel || !outValue) {
    throw new Error(
      "Pass --left-dir, --right-dir, --left-label, --right-label, and --out."
    );
  }
  const leftDir = path.resolve(leftDirValue);
  const rightDir = path.resolve(rightDirValue);
  const outPath = path.resolve(outValue);
  const manifest = await readJson(path.join(leftDir, "manifest.json"));
  const manifestResults = Array.isArray(manifest.results) ? manifest.results : [];
  const caseIds = manifestResults
    .map((entry) =>
      entry &&
      typeof entry === "object" &&
      typeof (entry as { caseId?: unknown }).caseId === "string"
        ? (entry as { caseId: string }).caseId
        : null
    )
    .filter((caseId): caseId is string => caseId !== null)
    .sort();
  const cases = await Promise.all(
    caseIds.map(async (caseId) => {
      const [left, right] = await Promise.all([
        loadCaseArtifact({ caseId, directory: leftDir, label: leftLabel }),
        loadCaseArtifact({ caseId, directory: rightDir, label: rightLabel })
      ]);
      return {
        caseId,
        executionProvenance: {
          left: left.executionProvenance,
          right: right.executionProvenance
        },
        disagreements: POLICY_REVIEW_EVALUATION_TOPICS.flatMap((topic) => {
          const leftDecision = left.decisions[topic];
          const rightDecision = right.decisions[topic];
          return leftDecision.status === rightDecision.status
            ? []
            : [{
              topic,
              left: leftDecision,
              right: rightDecision
            }];
        })
      };
    })
  );
  const byTopic = Object.fromEntries(
    POLICY_REVIEW_EVALUATION_TOPICS.map((topic) => {
      const disagreementCount = cases.filter((entry) =>
        entry.disagreements.some((difference) => difference.topic === topic)
      ).length;
      return [
        topic,
        {
          agreementCount: cases.length - disagreementCount,
          disagreementCount
        }
      ];
    })
  ) as Record<
    PolicyReviewTopic,
    { agreementCount: number; disagreementCount: number }
  >;
  const disagreementCount = cases.reduce(
    (total, entry) => total + entry.disagreements.length,
    0
  );
  const comparison = {
    contractVersion: "policy_review_model_comparison.v1",
    generatedAt: new Date().toISOString(),
    leftLabel,
    rightLabel,
    caseCount: cases.length,
    rowCount: cases.length * POLICY_REVIEW_EVALUATION_TOPICS.length,
    agreementCount:
      cases.length * POLICY_REVIEW_EVALUATION_TOPICS.length - disagreementCount,
    disagreementCount,
    rowAgreementRate:
      1 -
      disagreementCount /
        (cases.length * POLICY_REVIEW_EVALUATION_TOPICS.length),
    casesWithDisagreements: cases.filter(
      (entry) => entry.disagreements.length > 0
    ).length,
    byTopic,
    cases,
    productionEligible: false
  };
  await writeFile(outPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");
  await writeFile(
    outPath.replace(/\.json$/i, ".md"),
    renderMarkdown(comparison),
    "utf8"
  );
  console.log(JSON.stringify({
    outPath,
    caseCount: comparison.caseCount,
    rowCount: comparison.rowCount,
    agreementCount: comparison.agreementCount,
    disagreementCount: comparison.disagreementCount,
    rowAgreementRate: comparison.rowAgreementRate,
    casesWithDisagreements: comparison.casesWithDisagreements
  }, null, 2));
}

void main().catch((error) => {
  console.error(
    "[compare-policy-review-benchmarks]",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
