import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { policyModelReviewArtifactSchema } from "@certscore/contracts";
import {
  independentPolicyReviewPacketSchema,
  type IndependentPolicyReviewPacket,
} from "../src/validation/model-review-independent-review";
import {
  reviewPolicyPacketWithModel,
  summarizePolicyReviewArtifact,
  type PolicyReviewPacket,
} from "../src/validation/model-policy-review";
import {
  buildMiniEscalationTransport,
  composeHybridPolicyReviewArtifact,
} from "../src/validation/policy-review-escalation";

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
  const model = getArgValue("--model") ?? "gpt-5.4-mini";
  const packetDir = path.resolve(
    getArgValue("--packet-dir") ?? "artifacts/policy-review-independent-v1",
  );
  const nanoDir = path.resolve(
    getArgValue("--nano-dir") ??
      "artifacts/policy-review-model-benchmark-v1/gpt-5.4-nano-routing-v1",
  );
  const outDir = path.resolve(
    getArgValue("--out-dir") ??
      "artifacts/policy-review-model-benchmark-v1/gpt-5.4-mini-bounded-escalation-v1",
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
    const nanoCase = JSON.parse(await readFile(
      path.join(nanoDir, `${reviewerPacket.caseId}.json`),
      "utf8",
    )) as { modelArtifact?: unknown };
    const nanoArtifact = policyModelReviewArtifactSchema.parse(nanoCase.modelArtifact);
    const transport = buildMiniEscalationTransport({ nanoArtifact, packet });
    const outputPath = path.join(outDir, `${reviewerPacket.caseId}.json`);
    let miniArtifact = null;
    if (resume) {
      try {
        const existing = JSON.parse(await readFile(outputPath, "utf8")) as {
          evidenceHash?: unknown;
          miniEscalationArtifact?: unknown;
          transportContentHash?: unknown;
        };
        const parsed = policyModelReviewArtifactSchema.safeParse(
          existing.miniEscalationArtifact,
        );
        if (
          existing.evidenceHash === reviewerPacket.evidenceHash &&
          existing.transportContentHash === transport.packet.contentHash &&
          parsed.success &&
          parsed.data.status === "completed" &&
          parsed.data.provenance.requestedModel === model
        ) miniArtifact = parsed.data;
      } catch {
        miniArtifact = null;
      }
    }
    miniArtifact ??= await reviewPolicyPacketWithModel({
      apiKey: process.env.OPENAI_API_KEY,
      mode: "shadow",
      model,
      packet,
      reviewPhase: "escalated",
      topics: transport.topics,
      transportPacket: transport.packet,
    });
    const hybridArtifact = composeHybridPolicyReviewArtifact({
      miniArtifact,
      nanoArtifact,
      packet,
      topics: transport.topics,
    });
    const result = {
      caseId: reviewerPacket.caseId,
      evidenceHash: reviewerPacket.evidenceHash,
      escalatedTopicCount: transport.topics.length,
      bypassedTopicCount: 8 - transport.topics.length,
      miniPromptTokens: miniArtifact.provenance.promptTokens,
      miniCompletionTokens: miniArtifact.provenance.completionTokens,
      status: hybridArtifact.status,
      transportMetrics: transport.metrics,
    };
    await writeFile(outputPath, `${JSON.stringify({
      contractVersion: "policy_review_escalation_benchmark_case.v1",
      caseId: reviewerPacket.caseId,
      targetUrl: reviewerPacket.targetUrl,
      evidenceHash: reviewerPacket.evidenceHash,
      transportContentHash: transport.packet.contentHash,
      escalatedTopics: transport.topics,
      transportMetrics: transport.metrics,
      nanoArtifact,
      miniEscalationArtifact: miniArtifact,
      modelArtifact: hybridArtifact,
      productionEligible: false,
    }, null, 2)}\n`, "utf8");
    results.push(result);
    console.log(`[policy-review-escalation-benchmark] ${reviewerPacket.caseId}: ${hybridArtifact.status}`);
  });

  const sortedResults = results.sort((left, right) =>
    String(left.caseId).localeCompare(String(right.caseId))
  );
  const numberSum = (key: string) => sortedResults.reduce(
    (sum, result) => sum + (typeof result[key] === "number" ? result[key] : 0),
    0,
  );
  const fullTextCharacters = sortedResults.reduce(
    (sum, result) => sum + Number((result.transportMetrics as { fullTextCharacters?: unknown })?.fullTextCharacters ?? 0),
    0,
  );
  const transportedTextCharacters = sortedResults.reduce(
    (sum, result) => sum + Number((result.transportMetrics as { transportedTextCharacters?: unknown })?.transportedTextCharacters ?? 0),
    0,
  );
  const manifest = {
    contractVersion: "policy_review_escalation_benchmark_manifest.v1",
    requestedModel: model,
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
      fullTextCharacters,
      transportedTextCharacters,
      textReductionRate: fullTextCharacters > 0
        ? 1 - transportedTextCharacters / fullTextCharacters
        : 0,
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
    "[policy-review-escalation-benchmark]",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
