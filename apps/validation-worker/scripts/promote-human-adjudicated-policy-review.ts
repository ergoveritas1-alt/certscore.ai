import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  policyModelReviewArtifactSchema,
  type PolicyReviewStatus,
  type PolicyReviewTopic
} from "@certscore/contracts";
import {
  policyReviewGoldCorpusSchema,
  type PolicyReviewGoldCorpus
} from "../src/validation/model-review-gold-corpus";
import { POLICY_REVIEW_EVALUATION_TOPICS } from "../src/validation/model-review-evaluation";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

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

function stringCell(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
}

function rowsFromRaw(raw: Record<string, unknown>) {
  const candidate =
    raw.modelArtifact &&
    typeof raw.modelArtifact === "object" &&
    !Array.isArray(raw.modelArtifact)
      ? raw.modelArtifact
      : raw;
  const parsedArtifact = policyModelReviewArtifactSchema.safeParse(candidate);
  if (parsedArtifact.success && parsedArtifact.data.status === "completed") {
    return Object.fromEntries(
      parsedArtifact.data.rows.map((row) => [row.topic, row.status])
    ) as Record<PolicyReviewTopic, PolicyReviewStatus>;
  }
  if (
    raw.decisions &&
    typeof raw.decisions === "object" &&
    !Array.isArray(raw.decisions)
  ) {
    return Object.fromEntries(
      Object.entries(raw.decisions as Record<string, unknown>).map(
        ([topic, value]) => [
          topic,
          (value as { status?: PolicyReviewStatus }).status
        ]
      )
    ) as Record<PolicyReviewTopic, PolicyReviewStatus>;
  }
  return null;
}

async function modelRows(directory: string, caseId: string, allowFallback = false) {
  const raw = await readJson(path.join(directory, `${caseId}.json`));
  const primary = rowsFromRaw(raw);
  if (primary) {
    return primary;
  }
  if (allowFallback) {
    const fallback = await readJson(
      path.join(directory, `${caseId}.codex-agent-fallback.json`)
    );
    const parsed = rowsFromRaw(fallback);
    if (parsed) {
      return parsed;
    }
  }
  throw new Error(`Model decisions were incomplete for ${caseId} in ${directory}.`);
}

async function loadAdjudicatedRows(filePath: string) {
  const raw = await readJson(filePath);
  const rows = Array.isArray(raw.rows) ? raw.rows : [];
  const decisions = new Map<string, PolicyReviewStatus>();
  for (const rawRow of rows.slice(1)) {
    if (!Array.isArray(rawRow)) {
      continue;
    }
    const caseId = stringCell(rawRow[2]);
    const topic = TOPIC_BY_LABEL[stringCell(rawRow[3])];
    const status = stringCell(rawRow[11]) as PolicyReviewStatus;
    if (caseId && topic && status) {
      decisions.set(`${caseId}:${topic}`, status);
    }
  }
  return decisions;
}

function hasRetainedRuntimeIdentifier(packet: Record<string, unknown>) {
  const evidence =
    packet.evidence &&
    typeof packet.evidence === "object" &&
    !Array.isArray(packet.evidence)
      ? packet.evidence as Record<string, unknown>
      : {};
  const runtime =
    evidence.runtimeContext &&
    typeof evidence.runtimeContext === "object" &&
    !Array.isArray(evidence.runtimeContext)
      ? evidence.runtimeContext as Record<string, unknown>
      : {};
  const candidates: unknown[] = [];
  if (Array.isArray(runtime.cookies)) {
    for (const cookie of runtime.cookies) {
      if (cookie && typeof cookie === "object" && !Array.isArray(cookie)) {
        const record = cookie as Record<string, unknown>;
        candidates.push(record.cookieName, record.storageName, record.name);
      }
    }
  }
  for (const key of ["storageKeys", "localStorageKeys", "sessionStorageKeys"]) {
    if (Array.isArray(runtime[key])) {
      candidates.push(...runtime[key]);
    }
  }
  return candidates.some((candidate) => {
    if (typeof candidate !== "string") {
      return false;
    }
    const normalized = candidate.trim().toLowerCase();
    return normalized.length >= 2 &&
      !["cookie", "cookies", "name", "unknown", "n/a", "none"].includes(
        normalized
      );
  });
}

async function main() {
  const corpusPath = path.resolve(
    getArgValue("--corpus") ?? "fixtures/policy-review-gold-corpus.v1.json"
  );
  const adjudicationPath = path.resolve(
    getArgValue("--adjudication") ??
      "../../outputs/policy-review-adjudication-20260725/reviewed-decisions.v3.json"
  );
  const baselineMiniDir = path.resolve(
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
  const updatedMiniLane =
    getArgValue("--updated-mini-lane") ??
    "gpt-5.4-mini-post-canonical-rules-v2";
  const updatedMiniDir = path.resolve(
    "artifacts/policy-review-model-benchmark-v1",
    updatedMiniLane
  );
  const packetDir = path.resolve(
    getArgValue("--packet-dir") ??
      "artifacts/policy-review-independent-v1"
  );
  const reviewer = getArgValue("--reviewer") ?? "ben-masek";
  const reviewedAt =
    getArgValue("--reviewed-at") ?? new Date().toISOString();

  const corpus = policyReviewGoldCorpusSchema.parse(
    await readJson(corpusPath)
  );
  const adjudicated = await loadAdjudicatedRows(adjudicationPath);
  const entries: PolicyReviewGoldCorpus["entries"] = [];

  for (const entry of corpus.entries) {
    const [baselineMini, sol, sonnet] = await Promise.all([
      modelRows(baselineMiniDir, entry.caseId),
      modelRows(solDir, entry.caseId, true),
      modelRows(sonnetDir, entry.caseId)
    ]);
    const expected = Object.fromEntries(
      POLICY_REVIEW_EVALUATION_TOPICS.map((topic) => {
        const humanDecision = adjudicated.get(`${entry.caseId}:${topic}`);
        if (humanDecision) {
          return [topic, humanDecision];
        }
        const consensus = new Set([
          baselineMini[topic],
          sol[topic],
          sonnet[topic]
        ]);
        if (consensus.size !== 1) {
          throw new Error(
            `No human adjudication or three-model consensus for ${entry.caseId}/${topic}.`
          );
        }
        return [topic, baselineMini[topic]];
      })
    ) as Record<PolicyReviewTopic, PolicyReviewStatus>;
    const packet = await readJson(
      path.join(packetDir, entry.caseId, `${entry.caseId}.packet.json`)
    );
    if (hasRetainedRuntimeIdentifier(packet)) {
      expected.cookie_inventory = "observed";
    }

    entries.push({
      ...entry,
      modelArtifactPath:
        `apps/validation-worker/artifacts/policy-review-model-benchmark-v1/` +
        `${updatedMiniLane}/${entry.caseId}.json`,
      reviewStatus: "human_adjudicated",
      reviewBasis: "human_model_comparison",
      reviewer,
      reviewedAt,
      evidenceNotes: [
        "The product owner reviewed the complete three-model comparison and retained evidence, including unanimous and disagreement rows.",
        "Disagreement decisions are retained in the reviewed adjudication workbook; unanimous rows were explicitly accepted during the same human review.",
        "Cookie/storage-name presence, substantive retention evidence, policy ownership, topic relevance, transfer disclosure, and stale-framework validity follow the approved canonical rules."
      ],
      expected,
      baseline: baselineMini
    });
  }

  const promoted = policyReviewGoldCorpusSchema.parse({
    ...corpus,
    description:
      "Human-adjudicated 25-case policy-review calibration corpus. The product owner reviewed all 200 topic rows using retained evidence and a three-model comparison.",
    entries
  });
  await writeFile(corpusPath, `${JSON.stringify(promoted, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        corpusPath,
        caseCount: promoted.entries.length,
        reviewedRowCount:
          promoted.entries.length * POLICY_REVIEW_EVALUATION_TOPICS.length,
        reviewer,
        reviewedAt
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(
    "[promote-human-adjudicated-policy-review]",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
