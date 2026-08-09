import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { policyModelReviewArtifactSchema } from "@certscore/contracts";
import {
  independentPolicyReviewPacketSchema,
  type IndependentPolicyReviewPacket,
} from "../src/validation/model-review-independent-review";
import {
  reviewPolicyPacketWithModel,
  type PolicyReviewPacket,
} from "../src/validation/model-policy-review";
import { buildBoundedMiniTopicTransport } from "../src/validation/policy-review-escalation";
import {
  composeDualNanoConsensusShadowArtifact,
  routeDualNanoPolicyReview,
  summarizeDualNanoConsensus,
} from "../src/validation/policy-review-consensus";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function benchmarkPacket(packet: IndependentPolicyReviewPacket): PolicyReviewPacket {
  return {
    contentHash: packet.evidenceHash,
    documents: packet.evidence.documents.map((document) => ({
      ...document,
      extractedCandidates: {},
    })),
    evidenceCoverage: packet.evidence.evidenceCoverage,
    policyCandidates: [],
    runtimeContext: packet.evidence.runtimeContext,
    scanContext: packet.evidence.scanContext,
    scanDate: packet.scanDate,
    scanId: packet.scanId,
  };
}

async function loadPackets(packetDir: string) {
  const entries = await readdir(packetDir, { withFileTypes: true });
  return Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) =>
    independentPolicyReviewPacketSchema.parse(JSON.parse(await readFile(
      path.join(packetDir, entry.name, `${entry.name}.packet.json`),
      "utf8",
    )))
  )).then((packets) => packets.sort((left, right) => left.caseId.localeCompare(right.caseId)));
}

async function loadArtifact(filePath: string) {
  const raw = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  return policyModelReviewArtifactSchema.parse(raw.modelArtifact ?? raw);
}

async function runWithConcurrency<T>(
  values: T[],
  concurrency: number,
  run: (value: T) => Promise<void>,
) {
  let nextIndex = 0;
  await Promise.all(Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const value = values[nextIndex];
        nextIndex += 1;
        if (value !== undefined) await run(value);
      }
    },
  ));
}

async function main() {
  const nanoModel = getArgValue("--nano-model") ?? "gpt-5.4-nano";
  const miniModel = getArgValue("--mini-model") ?? "gpt-5.4-mini";
  const packetDir = path.resolve(
    getArgValue("--packet-dir") ?? "artifacts/policy-review-independent-v1",
  );
  const primaryDir = path.resolve(
    getArgValue("--primary-dir") ??
      "artifacts/policy-review-model-benchmark-v1/gpt-5.4-nano-routing-v1",
  );
  const canonicalMiniDir = path.resolve(
    getArgValue("--canonical-mini-dir") ??
      "artifacts/policy-review-model-benchmark-v1/gpt-5.4-mini-production-projection-v1",
  );
  const outDir = path.resolve(
    getArgValue("--out-dir") ??
      "artifacts/policy-review-model-benchmark-v1/gpt-5.4-dual-nano-consensus-v1",
  );
  const concurrency = positiveInteger(getArgValue("--concurrency"), 3);
  const resume = process.argv.includes("--resume");
  const onlyCaseId = getArgValue("--case");
  const packets = (await loadPackets(packetDir)).filter((packet) =>
    !onlyCaseId || packet.caseId === onlyCaseId
  );
  if (packets.length === 0) throw new Error(`No packet matched ${onlyCaseId}.`);
  await mkdir(outDir, { recursive: true });

  const results: Array<Record<string, unknown>> = [];
  await runWithConcurrency(packets, concurrency, async (reviewerPacket) => {
    const packet = benchmarkPacket(reviewerPacket);
    const primaryArtifact = await loadArtifact(
      path.join(primaryDir, `${reviewerPacket.caseId}.json`),
    );
    const canonicalMiniArtifact = await loadArtifact(
      path.join(canonicalMiniDir, `${reviewerPacket.caseId}.json`),
    );
    const outputPath = path.join(outDir, `${reviewerPacket.caseId}.json`);
    let existing: Record<string, unknown> = {};
    if (resume) {
      try {
        existing = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;
      } catch {
        existing = {};
      }
    }
    const existingCritic = policyModelReviewArtifactSchema.safeParse(
      existing.criticArtifact,
    );
    const criticArtifact =
      existing.evidenceHash === reviewerPacket.evidenceHash &&
      existing.primaryCacheKey === primaryArtifact.cacheKey &&
      existingCritic.success &&
      existingCritic.data.status === "completed" &&
      existingCritic.data.provenance.requestedModel === nanoModel
        ? existingCritic.data
        : await reviewPolicyPacketWithModel({
            apiKey: process.env.OPENAI_API_KEY,
            candidateArtifact: primaryArtifact,
            mode: "shadow",
            model: nanoModel,
            packet,
            reviewPhase: "critic",
          });
    const decisions = routeDualNanoPolicyReview({ criticArtifact, primaryArtifact });
    const escalationTopics = decisions
      .filter((decision) => decision.requiresMiniEscalation)
      .map((decision) => decision.topic);
    const escalationExcerpts = [...primaryArtifact.rows, ...criticArtifact.rows]
      .filter((row) => escalationTopics.includes(row.topic))
      .flatMap((row) => [...row.evidenceExcerpts, ...row.conflictingExcerpts]);
    const transport = buildBoundedMiniTopicTransport({
      packet,
      passageExcerpts: escalationExcerpts,
      topics: escalationTopics,
      transportVersion: "policy_dual_nano_mini_transport.v1",
    });
    const existingMini = policyModelReviewArtifactSchema.safeParse(
      existing.miniEscalationArtifact,
    );
    const miniArtifact = escalationTopics.length === 0
      ? null
      : existing.evidenceHash === reviewerPacket.evidenceHash &&
          existing.transportContentHash === transport.packet.contentHash &&
          existingMini.success &&
          existingMini.data.status === "completed" &&
          existingMini.data.provenance.requestedModel === miniModel
        ? existingMini.data
        : await reviewPolicyPacketWithModel({
            apiKey: process.env.OPENAI_API_KEY,
            mode: "shadow",
            model: miniModel,
            packet,
            reviewPhase: "escalated",
            topics: escalationTopics,
            transportPacket: transport.packet,
          });
    const modelArtifact = composeDualNanoConsensusShadowArtifact({
      criticArtifact,
      decisions,
      miniArtifact,
      packet,
      primaryArtifact,
    });
    const routing = summarizeDualNanoConsensus({
      canonicalMiniArtifact,
      criticArtifact,
      decisions,
      miniEscalationArtifact: miniArtifact,
      primaryArtifact,
    });
    const result = {
      caseId: reviewerPacket.caseId,
      bypassedTopicCount: 8 - escalationTopics.length,
      escalatedTopicCount: escalationTopics.length,
      miniCompletionTokens: miniArtifact?.provenance.completionTokens ?? 0,
      miniPromptTokens: miniArtifact?.provenance.promptTokens ?? 0,
      miniCost: routing.miniCost,
      status: modelArtifact.status,
      transportMetrics: transport.metrics,
    };
    await writeFile(outputPath, `${JSON.stringify({
      contractVersion: "policy_review_dual_nano_benchmark_case.v1",
      caseId: reviewerPacket.caseId,
      targetUrl: reviewerPacket.targetUrl,
      evidenceHash: reviewerPacket.evidenceHash,
      primaryCacheKey: primaryArtifact.cacheKey,
      transportContentHash: transport.packet.contentHash,
      escalationTopics,
      transportMetrics: transport.metrics,
      routing,
      primaryArtifact,
      criticArtifact,
      miniEscalationArtifact: miniArtifact,
      modelArtifact,
      productionEligible: false,
    }, null, 2)}\n`, "utf8");
    results.push(result);
    console.log(`[policy-review-dual-nano-benchmark] ${reviewerPacket.caseId}: ${modelArtifact.status}`);
  });

  const sortedResults = results.sort((left, right) =>
    String(left.caseId).localeCompare(String(right.caseId))
  );
  const numberSum = (key: string) => sortedResults.reduce(
    (sum, result) => sum + (typeof result[key] === "number" ? result[key] : 0),
    0,
  );
  const canonicalCostUnits = sortedResults.reduce(
    (sum, result) => sum + Number(
      (result.miniCost as { canonicalCostUnits?: unknown })?.canonicalCostUnits ?? 0,
    ),
    0,
  );
  const escalationCostUnits = sortedResults.reduce(
    (sum, result) => sum + Number(
      (result.miniCost as { escalationCostUnits?: unknown })?.escalationCostUnits ?? 0,
    ),
    0,
  );
  const manifest = {
    contractVersion: "policy_review_dual_nano_benchmark_manifest.v1",
    requestedNanoModel: nanoModel,
    requestedMiniModel: miniModel,
    completedAt: new Date().toISOString(),
    caseCount: sortedResults.length,
    completedCount: sortedResults.filter((result) => result.status === "completed").length,
    failedCount: sortedResults.filter((result) => result.status !== "completed").length,
    productionEligible: false,
    totals: {
      bypassedTopicCount: numberSum("bypassedTopicCount"),
      escalatedTopicCount: numberSum("escalatedTopicCount"),
      miniPromptTokens: numberSum("miniPromptTokens"),
      miniCompletionTokens: numberSum("miniCompletionTokens"),
      canonicalMiniCostUnits: canonicalCostUnits,
      escalationMiniCostUnits: escalationCostUnits,
      estimatedMiniCostReductionRate: canonicalCostUnits > 0
        ? 1 - escalationCostUnits / canonicalCostUnits
        : null,
      targetMiniCostReductionRate: 0.95,
    },
    results: sortedResults,
  };
  await writeFile(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(manifest, null, 2));
}

void main().catch((error) => {
  console.error(
    "[policy-review-dual-nano-benchmark]",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
