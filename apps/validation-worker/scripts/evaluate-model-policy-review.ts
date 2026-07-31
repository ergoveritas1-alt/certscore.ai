import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  policyModelReviewArtifactSchema,
  type PolicyModelReviewArtifact
} from "@certscore/contracts";
import { queryOne } from "@website-signal-risk-scanner/db";
import {
  assessPolicyReviewRolloutReadiness,
  policyReviewGoldCorpusSchema
} from "../src/validation/model-review-gold-corpus";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  const labelsPath = path.resolve(
    getArgValue("--labels") ?? "fixtures/policy-review-gold-corpus.v1.json"
  );
  const corpus = policyReviewGoldCorpusSchema.parse(
    JSON.parse(await readFile(labelsPath, "utf8"))
  );
  const reviewedEntries = corpus.entries.filter(
    (entry) => entry.reviewStatus !== "pending"
  );
  const artifactsByScanId = new Map<string, PolicyModelReviewArtifact>();
  const unavailableArtifacts: string[] = [];

  await Promise.all(reviewedEntries.map(async (entry) => {
    if (entry.modelArtifactPath) {
      try {
        const raw = JSON.parse(
          await readFile(path.resolve(REPO_ROOT, entry.modelArtifactPath), "utf8")
        ) as Record<string, unknown>;
        const parsed = policyModelReviewArtifactSchema.parse(
          raw.modelArtifact &&
          typeof raw.modelArtifact === "object" &&
          !Array.isArray(raw.modelArtifact)
            ? raw.modelArtifact
            : raw
        );
        if (parsed.scanId !== entry.scanId) {
          unavailableArtifacts.push(entry.caseId);
          return;
        }
        artifactsByScanId.set(entry.scanId, parsed);
      } catch {
        unavailableArtifacts.push(entry.caseId);
      }
      return;
    }
    if (!UUID_PATTERN.test(entry.scanId)) {
      unavailableArtifacts.push(entry.caseId);
      return;
    }
    const row = await queryOne<{ review_json: unknown }>(
      `select review_json
         from scan_model_review_artifacts
        where scan_id = $1
          and review_kind = 'policy_semantic'
        order by updated_at desc
        limit 1`,
      [entry.scanId],
      { readOnly: true }
    );
    const parsed = policyModelReviewArtifactSchema.safeParse(row?.review_json);
    if (!parsed.success) {
      unavailableArtifacts.push(entry.caseId);
      return;
    }
    artifactsByScanId.set(entry.scanId, parsed.data);
  }));

  const assessment = assessPolicyReviewRolloutReadiness({
    artifactsByScanId,
    corpus
  });
  console.log(JSON.stringify({
    labelsPath,
    evaluatedAt: new Date().toISOString(),
    fullStatusRolloutReady: assessment.ready,
    precisionFirstObservedProjectionReady:
      assessment.precisionFirstObservedProjectionReady,
    approvedProjectionScope: assessment.approvedProjectionScope,
    productionEligible: assessment.productionEligible,
    corpus: assessment.corpus,
    failures: assessment.failures,
    unavailableArtifacts: unavailableArtifacts.sort(),
    provisionalMetrics: assessment.provisionalMetrics,
    humanReviewedMetrics: assessment.humanReviewedMetrics,
    nextPendingCases: corpus.entries
      .filter((entry) => entry.reviewStatus === "pending")
      .slice(0, 10)
      .map((entry) => ({
        caseId: entry.caseId,
        scanId: entry.scanId,
        targetUrl: entry.targetUrl
      }))
  }, null, 2));

  if (process.argv.includes("--strict") && !assessment.ready) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error("[model-policy-evaluation]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
