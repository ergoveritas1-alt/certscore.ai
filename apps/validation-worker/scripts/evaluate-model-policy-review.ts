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
import { routeNanoPolicyReview } from "../src/validation/policy-review-routing";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  const reviewKind = getArgValue("--review-kind") ?? "policy_semantic";
  if (
    reviewKind !== "policy_semantic" &&
    reviewKind !== "policy_semantic_nano_shadow" &&
    reviewKind !== "policy_semantic_hybrid_shadow" &&
    reviewKind !== "policy_semantic_dual_nano_shadow"
  ) {
    throw new Error(
      "--review-kind must be policy_semantic, policy_semantic_nano_shadow, policy_semantic_hybrid_shadow, or policy_semantic_dual_nano_shadow.",
    );
  }
  const labelsPath = path.resolve(
    getArgValue("--labels") ?? "fixtures/policy-review-gold-corpus.v1.json"
  );
  const corpus = policyReviewGoldCorpusSchema.parse(
    JSON.parse(await readFile(labelsPath, "utf8"))
  );
  const artifactDirArg = getArgValue("--artifact-dir");
  const artifactDir = artifactDirArg ? path.resolve(artifactDirArg) : null;
  if (
    (reviewKind === "policy_semantic_hybrid_shadow" ||
      reviewKind === "policy_semantic_dual_nano_shadow") &&
    !artifactDir
  ) {
    throw new Error(`${reviewKind} requires --artifact-dir.`);
  }
  const reviewedEntries = corpus.entries.filter(
    (entry) => entry.reviewStatus !== "pending"
  );
  const artifactsByScanId = new Map<string, PolicyModelReviewArtifact>();
  const artifactCasesByCaseId = new Map<string, Record<string, unknown>>();
  const unavailableArtifacts: string[] = [];

  await Promise.all(reviewedEntries.map(async (entry) => {
    if (artifactDir) {
      try {
        const raw = JSON.parse(
          await readFile(path.join(artifactDir, `${entry.caseId}.json`), "utf8")
        ) as Record<string, unknown>;
        artifactCasesByCaseId.set(entry.caseId, raw);
        const parsed = policyModelReviewArtifactSchema.parse(raw.modelArtifact ?? raw);
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
    if (entry.modelArtifactPath && reviewKind === "policy_semantic") {
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
          and review_kind = $2
        order by updated_at desc
        limit 1`,
      [entry.scanId, reviewKind],
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
  const nanoRoutingSafety = reviewKind === "policy_semantic_nano_shadow"
    ? (() => {
        const missedMismatchRows: Array<{
          caseId: string;
          expectedStatus: string;
          nanoStatus: string | null;
          topic: string;
        }> = [];
        let bypassedTopicCount = 0;
        let escalatedTopicCount = 0;
        for (const entry of reviewedEntries) {
          const artifact = artifactsByScanId.get(entry.scanId);
          if (!artifact) continue;
          for (const decision of routeNanoPolicyReview(artifact)) {
            if (decision.requiresMiniEscalation) {
              escalatedTopicCount += 1;
              continue;
            }
            bypassedTopicCount += 1;
            const expectedStatus = entry.expected[decision.topic];
            if (expectedStatus && expectedStatus !== decision.status) {
              missedMismatchRows.push({
                caseId: entry.caseId,
                expectedStatus,
                nanoStatus: decision.status,
                topic: decision.topic,
              });
            }
          }
        }
        return {
          bypassedTopicCount,
          candidateRoutingReady:
            unavailableArtifacts.length === 0 &&
            missedMismatchRows.length === 0 &&
            assessment.precisionFirstObservedProjectionReady,
          escalatedTopicCount,
          estimatedMiniTopicReductionRate:
            bypassedTopicCount + escalatedTopicCount > 0
              ? bypassedTopicCount / (bypassedTopicCount + escalatedTopicCount)
              : null,
          missedMismatchRows,
          productionProjectable: false,
        };
      })()
    : null;
  const dualNanoRoutingSafety = reviewKind === "policy_semantic_dual_nano_shadow"
    ? (() => {
        const missedMismatchRows: Array<{
          caseId: string;
          expectedStatus: string;
          routedStatus: string | null;
          topic: string;
        }> = [];
        let bypassedTopicCount = 0;
        let escalatedTopicCount = 0;
        let canonicalMiniCostUnits = 0;
        let escalationMiniCostUnits = 0;
        for (const entry of reviewedEntries) {
          const raw = artifactCasesByCaseId.get(entry.caseId);
          const routing = raw?.routing && typeof raw.routing === "object" && !Array.isArray(raw.routing)
            ? raw.routing as Record<string, unknown>
            : {};
          const decisions = Array.isArray(routing.decisions) ? routing.decisions : [];
          for (const rawDecision of decisions) {
            if (!rawDecision || typeof rawDecision !== "object" || Array.isArray(rawDecision)) continue;
            const decision = rawDecision as Record<string, unknown>;
            const topic = typeof decision.topic === "string" ? decision.topic : null;
            if (!topic || !(topic in entry.expected)) continue;
            if (decision.requiresMiniEscalation === true) {
              escalatedTopicCount += 1;
              continue;
            }
            bypassedTopicCount += 1;
            const routedStatus = typeof decision.status === "string" ? decision.status : null;
            const expectedStatus = entry.expected[topic as keyof typeof entry.expected];
            if (typeof expectedStatus !== "string") continue;
            if (expectedStatus !== routedStatus) {
              missedMismatchRows.push({
                caseId: entry.caseId,
                expectedStatus,
                routedStatus,
                topic,
              });
            }
          }
          const miniCost = routing.miniCost && typeof routing.miniCost === "object" && !Array.isArray(routing.miniCost)
            ? routing.miniCost as Record<string, unknown>
            : {};
          canonicalMiniCostUnits += typeof miniCost.canonicalCostUnits === "number"
            ? miniCost.canonicalCostUnits
            : 0;
          escalationMiniCostUnits += typeof miniCost.escalationCostUnits === "number"
            ? miniCost.escalationCostUnits
            : 0;
        }
        const estimatedMiniCostReductionRate = canonicalMiniCostUnits > 0
          ? 1 - escalationMiniCostUnits / canonicalMiniCostUnits
          : null;
        return {
          bypassedTopicCount,
          candidateRoutingReady:
            unavailableArtifacts.length === 0 &&
            missedMismatchRows.length === 0 &&
            assessment.precisionFirstObservedProjectionReady &&
            estimatedMiniCostReductionRate !== null &&
            estimatedMiniCostReductionRate >= 0.95,
          escalatedTopicCount,
          estimatedMiniCostReductionRate,
          missedMismatchRows,
          productionProjectable: false,
          targetMiniCostReductionRate: 0.95,
        };
      })()
    : null;
  console.log(JSON.stringify({
    labelsPath,
    artifactDir,
    reviewKind,
    evaluatedAt: new Date().toISOString(),
    fullStatusRolloutReady: assessment.ready,
    precisionFirstObservedProjectionReady:
      assessment.precisionFirstObservedProjectionReady,
    approvedProjectionScope: assessment.approvedProjectionScope,
    productionEligible: reviewKind === "policy_semantic" && assessment.productionEligible,
    hybridShadowReady:
      reviewKind === "policy_semantic_hybrid_shadow" &&
      assessment.precisionFirstObservedProjectionReady,
    nanoRoutingSafety,
    dualNanoRoutingSafety,
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

  const strictReady = reviewKind === "policy_semantic_nano_shadow"
    ? nanoRoutingSafety?.candidateRoutingReady === true
    : reviewKind === "policy_semantic_dual_nano_shadow"
      ? dualNanoRoutingSafety?.candidateRoutingReady === true
    : reviewKind === "policy_semantic_hybrid_shadow"
      ? assessment.precisionFirstObservedProjectionReady
      : assessment.ready;
  if (process.argv.includes("--strict") && !strictReady) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error("[model-policy-evaluation]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
