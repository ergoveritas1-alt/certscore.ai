import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
  evidenceExcerpts: string[];
  rationale: string | null;
  reasonCodes: string[];
  status: PolicyReviewStatus;
};

type ReferenceDecision = Decision & {
  provenance:
    | "human_adjudicated_disagreement"
    | "three_model_consensus_unreviewed";
};

const TOPIC_BY_LABEL: Record<string, PolicyReviewTopic> = {
  "Processing purposes": "processing_purposes",
  "Legal basis": "legal_basis",
  "Data retention": "data_retention",
  "International transfers": "international_transfers",
  "Vendor disclosures": "vendor_disclosures",
  "Data-subject rights": "data_subject_rights",
  "Observed cookie/storage names": "cookie_inventory",
  "Policy/runtime consistency": "policy_runtime_consistency"
};

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
}

function decisionFromValue(value: Record<string, unknown>): Decision {
  return {
    confidence: typeof value.confidence === "number" ? value.confidence : null,
    evidenceExcerpts: Array.isArray(value.evidenceExcerpts)
      ? value.evidenceExcerpts.filter(
        (excerpt): excerpt is string => typeof excerpt === "string"
      )
      : [],
    rationale: typeof value.rationale === "string" ? value.rationale : null,
    reasonCodes: Array.isArray(value.reasonCodes)
      ? value.reasonCodes.filter(
        (reasonCode): reasonCode is string => typeof reasonCode === "string"
      )
      : [],
    status: value.status as PolicyReviewStatus
  };
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
        return [value.topic, decisionFromValue(value)];
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
        ([topic, rawDecision]) => [
          topic,
          decisionFromValue(rawDecision as Record<string, unknown>)
        ]
      )
    ) as Record<PolicyReviewTopic, Decision>;
  }
  return null;
}

async function loadCaseDecisions(input: {
  caseId: string;
  directory: string;
  allowFallback?: boolean;
}) {
  const primary = await readJson(path.join(input.directory, `${input.caseId}.json`));
  const decisions = parseDecisions(primary);
  if (decisions || !input.allowFallback) {
    return decisions;
  }
  try {
    const fallback = await readJson(
      path.join(input.directory, `${input.caseId}.codex-agent-fallback.json`)
    );
    return parseDecisions(fallback);
  } catch {
    return null;
  }
}

function stringCell(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function loadHumanDecisions(filePath: string) {
  const artifact = await readJson(filePath);
  const rows = Array.isArray(artifact.rows) ? artifact.rows : [];
  const decisions = new Map<string, ReferenceDecision>();
  for (const rawRow of rows.slice(1)) {
    if (!Array.isArray(rawRow)) {
      continue;
    }
    const caseId = stringCell(rawRow[2]);
    const topic = TOPIC_BY_LABEL[stringCell(rawRow[3])];
    const status = stringCell(rawRow[11]) as PolicyReviewStatus;
    if (
      !caseId ||
      !topic ||
      ![
        "observed",
        "not_observed_with_sufficient_coverage",
        "ambiguous",
        "conflicting",
        "insufficient_retained_evidence"
      ].includes(status)
    ) {
      continue;
    }
    decisions.set(`${caseId}:${topic}`, {
      confidence: null,
      evidenceExcerpts: [],
      rationale: stringCell(rawRow[13]) || null,
      reasonCodes: ["human_adjudicated_disagreement"],
      status,
      provenance: "human_adjudicated_disagreement"
    });
  }
  return decisions;
}

function metricSummary(input: Array<{
  actual: Decision | null;
  expected: ReferenceDecision;
}>) {
  const completed = input.filter(
    (row): row is { actual: Decision; expected: ReferenceDecision } =>
      row.actual !== null
  );
  const exact = completed.filter(
    (row) => row.actual.status === row.expected.status
  ).length;
  const expectedObserved = completed.filter(
    (row) => row.expected.status === "observed"
  ).length;
  const actualObserved = completed.filter(
    (row) => row.actual.status === "observed"
  ).length;
  const trueObserved = completed.filter(
    (row) =>
      row.expected.status === "observed" &&
      row.actual.status === "observed"
  ).length;
  return {
    rowCount: input.length,
    completedRowCount: completed.length,
    failedRowCount: input.length - completed.length,
    exactAgreementCount: exact,
    exactAgreementRate: completed.length > 0 ? exact / completed.length : 0,
    observedPrecision:
      actualObserved > 0 ? trueObserved / actualObserved : null,
    observedRecall:
      expectedObserved > 0 ? trueObserved / expectedObserved : null
  };
}

function compact(value: string | null, limit = 240) {
  if (!value) {
    return "";
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit
    ? normalized
    : `${normalized.slice(0, limit - 1)}…`;
}

function renderMarkdown(report: {
  baseline: ReturnType<typeof metricSummary>;
  byTopic: Record<
    PolicyReviewTopic,
    ReturnType<typeof metricSummary>
  >;
  caseCount: number;
  failedCases: string[];
  humanSubset: ReturnType<typeof metricSummary>;
  mismatches: Array<{
    actual: Decision;
    caseId: string;
    expected: ReferenceDecision;
    topic: PolicyReviewTopic;
  }>;
  referenceCounts: Record<ReferenceDecision["provenance"], number>;
  updated: ReturnType<typeof metricSummary>;
}) {
  const percent = (value: number | null) =>
    value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
  const lines = [
    "# Post-canonical Mini policy-review evaluation",
    "",
    "Internal calibration artifact only. It is not customer-facing or production eligible.",
    "",
    "## Outcome",
    "",
    `- Cases: ${report.caseCount}`,
    `- Reference rows: ${report.updated.rowCount}`,
    `- Human-adjudicated disagreement rows: ${report.referenceCounts.human_adjudicated_disagreement}`,
    `- Three-model-consensus rows not independently human-reviewed: ${report.referenceCounts.three_model_consensus_unreviewed}`,
    `- Updated Mini completed rows: ${report.updated.completedRowCount}`,
    `- Updated Mini failed rows: ${report.updated.failedRowCount}`,
    `- Baseline Mini exact agreement: ${percent(report.baseline.exactAgreementRate)}`,
    `- Updated Mini exact agreement: ${percent(report.updated.exactAgreementRate)}`,
    `- Updated Mini agreement on human-adjudicated rows: ${percent(report.humanSubset.exactAgreementRate)}`,
    `- Updated Mini observed precision / recall: ${percent(report.updated.observedPrecision)} / ${percent(report.updated.observedRecall)}`,
    `- Formal independent-review gate: blocked`,
    `- Production eligible: false`,
    "",
    "The 86 model-disagreement rows use the reviewed workbook decisions. The other 114 rows use unanimous three-model consensus as a calibration baseline, not as independent human gold.",
    "",
    "## Interpretation limits",
    "",
    "- This corpus was captured before the current typed policy-ownership and evidence-coverage fields. Legitimate cross-brand policy documents can therefore remain ownership-unknown, and missing coverage metadata forces the current reviewer to return insufficient retained evidence.",
    "- The reviewed workbook predates the canonical separation of international-transfer disclosure from an outdated-framework signal. A policy may disclose international transfers while separately triggering `outdated_transfer_framework_referenced`; the combined legacy status is not the current target behavior.",
    "- Consequently, the agreement figures below diagnose corpus and rule differences. They are not rollout-quality precision, recall, or production-readiness metrics.",
    "- A fresh packet set using current capture contracts must be reviewed evidence-only before the formal rollout gate can become measurable.",
    "",
    "## Agreement by topic",
    "",
    "| Topic | Complete | Failed | Agreement |",
    "| --- | ---: | ---: | ---: |",
    ...POLICY_REVIEW_EVALUATION_TOPICS.map((topic) => {
      const metric = report.byTopic[topic];
      return `| ${POLICY_REVIEW_TOPIC_DEFINITIONS[topic].displayLabel} | ${metric.completedRowCount} | ${metric.failedRowCount} | ${percent(metric.exactAgreementRate)} |`;
    }),
    "",
    "## Completion failures",
    "",
    ...(report.failedCases.length > 0
      ? report.failedCases.map((caseId) => `- ${caseId}`)
      : ["- None"]),
    "",
    "## Remaining disagreements",
    ""
  ];
  if (report.mismatches.length === 0) {
    lines.push("None.", "");
  } else {
    lines.push(
      "| Case | Topic | Reference | Updated Mini | Reference source |",
      "| --- | --- | --- | --- | --- |",
      ...report.mismatches.map((row) =>
        `| ${row.caseId} | ${POLICY_REVIEW_TOPIC_DEFINITIONS[row.topic].displayLabel} | ${row.expected.status} | ${row.actual.status} | ${row.expected.provenance} |`
      ),
      ""
    );
    for (const row of report.mismatches) {
      lines.push(
        `### ${row.caseId} — ${POLICY_REVIEW_TOPIC_DEFINITIONS[row.topic].displayLabel}`,
        "",
        `- Reference: \`${row.expected.status}\` (${row.expected.provenance})`,
        `- Updated Mini: \`${row.actual.status}\``,
        `- Reference rationale: ${compact(row.expected.rationale, 600) || "Not retained."}`,
        `- Mini rationale: ${compact(row.actual.rationale, 600) || "Not retained."}`,
        `- Mini evidence: ${compact(row.actual.evidenceExcerpts.join(" | "), 600) || "No excerpt retained."}`,
        `- Mini reason codes: ${row.actual.reasonCodes.join(", ") || "None"}`,
        ""
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const adjudicationPath = path.resolve(
    getArgValue("--adjudication") ??
      "../../outputs/policy-review-adjudication-20260725/reviewed-decisions.v3.json"
  );
  const miniDir = path.resolve(
    getArgValue("--baseline-mini-dir") ??
      "artifacts/policy-review-model-benchmark-v1/gpt-5.4-mini"
  );
  const solDir = path.resolve(
    getArgValue("--sol-dir") ??
      "artifacts/policy-review-model-benchmark-v1/gpt-5.6-sol"
  );
  const sonnetDir = path.resolve(
    getArgValue("--sonnet-dir") ??
      "artifacts/policy-review-model-benchmark-v1/claude-sonnet-5-medium"
  );
  const updatedMiniDir = path.resolve(
    getArgValue("--updated-mini-dir") ??
      "artifacts/policy-review-model-benchmark-v1/gpt-5.4-mini-post-canonical-rules"
  );
  const outPath = path.resolve(
    getArgValue("--out") ??
      "../../outputs/policy-review-adjudication-20260725/post-canonical-mini-evaluation.json"
  );

  const humanDecisions = await loadHumanDecisions(adjudicationPath);
  const caseIds = (await readdir(miniDir))
    .filter((fileName) => fileName.endsWith(".json") && fileName !== "manifest.json")
    .map((fileName) => fileName.replace(/\.json$/, ""))
    .filter((caseId) => !caseId.endsWith(".codex-agent-fallback"))
    .sort();
  const rows: Array<{
    actual: Decision | null;
    baseline: Decision;
    caseId: string;
    expected: ReferenceDecision;
    topic: PolicyReviewTopic;
  }> = [];
  const failedCases = new Set<string>();

  for (const caseId of caseIds) {
    const [mini, sol, sonnet, updatedMini] = await Promise.all([
      loadCaseDecisions({ caseId, directory: miniDir }),
      loadCaseDecisions({ caseId, directory: solDir, allowFallback: true }),
      loadCaseDecisions({ caseId, directory: sonnetDir }),
      loadCaseDecisions({ caseId, directory: updatedMiniDir })
    ]);
    if (!mini || !sol || !sonnet) {
      throw new Error(`Reference model decisions were incomplete for ${caseId}.`);
    }
    if (!updatedMini) {
      failedCases.add(caseId);
    }
    for (const topic of POLICY_REVIEW_EVALUATION_TOPICS) {
      const humanDecision = humanDecisions.get(`${caseId}:${topic}`);
      const consensusStatuses = new Set([
        mini[topic].status,
        sol[topic].status,
        sonnet[topic].status
      ]);
      const expected = humanDecision ??
        (consensusStatuses.size === 1
          ? {
            ...mini[topic],
            provenance: "three_model_consensus_unreviewed" as const
          }
          : null);
      if (!expected) {
        throw new Error(
          `No adjudicated decision or unanimous consensus for ${caseId}/${topic}.`
        );
      }
      rows.push({
        actual: updatedMini?.[topic] ?? null,
        baseline: mini[topic],
        caseId,
        expected,
        topic
      });
    }
  }

  const reportRows = rows.map(({ actual, expected }) => ({ actual, expected }));
  const humanRows = rows
    .filter(
      (row) => row.expected.provenance === "human_adjudicated_disagreement"
    )
    .map(({ actual, expected }) => ({ actual, expected }));
  const baselineRows = rows.map(({ baseline, expected }) => ({
    actual: baseline,
    expected
  }));
  const mismatches = rows.flatMap((row) =>
    row.actual && row.actual.status !== row.expected.status
      ? [{
        actual: row.actual,
        caseId: row.caseId,
        expected: row.expected,
        topic: row.topic
      }]
      : []
  );
  const report = {
    contractVersion: "policy_review_adjudicated_evaluation.v1",
    generatedAt: new Date().toISOString(),
    adjudicationPath,
    caseCount: caseIds.length,
    referenceCounts: {
      human_adjudicated_disagreement: rows.filter(
        (row) =>
          row.expected.provenance === "human_adjudicated_disagreement"
      ).length,
      three_model_consensus_unreviewed: rows.filter(
        (row) =>
          row.expected.provenance === "three_model_consensus_unreviewed"
      ).length
    },
    baseline: metricSummary(baselineRows),
    updated: metricSummary(reportRows),
    humanSubset: metricSummary(humanRows),
    byTopic: Object.fromEntries(
      POLICY_REVIEW_EVALUATION_TOPICS.map((topic) => [
        topic,
        metricSummary(
          rows
            .filter((row) => row.topic === topic)
            .map(({ actual, expected }) => ({ actual, expected }))
        )
      ])
    ) as Record<PolicyReviewTopic, ReturnType<typeof metricSummary>>,
    failedCases: [...failedCases],
    mismatchCount: mismatches.length,
    mismatches,
    benchmarkLimitations: [
      "legacy_packets_precede_typed_policy_ownership_and_coverage",
      "legacy_reference_combines_transfer_disclosure_with_stale_framework_validity",
      "agreement_metrics_are_diagnostic_not_rollout_quality",
      "fresh_current_contract_packets_require_evidence_only_review"
    ],
    formalIndependentReviewSatisfied: false,
    productionEligible: false
  };
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(
    outPath.replace(/\.json$/i, ".md"),
    renderMarkdown(report),
    "utf8"
  );
  console.log(
    JSON.stringify(
      {
        outPath,
        caseCount: report.caseCount,
        referenceCounts: report.referenceCounts,
        baseline: report.baseline,
        updated: report.updated,
        humanSubset: report.humanSubset,
        mismatchCount: report.mismatchCount,
        failedCases: report.failedCases,
        productionEligible: report.productionEligible
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(
    "[evaluate-adjudicated-policy-review]",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
