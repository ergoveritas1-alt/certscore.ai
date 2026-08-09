import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  independentPolicyReviewPacketSchema,
  type IndependentPolicyReviewPacket
} from "../src/validation/model-review-independent-review";
import {
  reviewPolicyPacketWithModel,
  summarizePolicyReviewArtifact,
  type PolicyReviewPacket
} from "../src/validation/model-policy-review";
import { summarizeNanoRouting } from "../src/validation/policy-review-routing";
import { policyModelReviewArtifactSchema } from "@certscore/contracts";

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
      extractedCandidates: {}
    })),
    evidenceCoverage: packet.evidence.evidenceCoverage,
    policyCandidates: [],
    runtimeContext: packet.evidence.runtimeContext,
    scanContext: packet.evidence.scanContext,
    scanDate: packet.scanDate,
    scanId: packet.scanId
  };
}

async function loadPackets(packetDir: string) {
  const caseDirectories = await readdir(packetDir, { withFileTypes: true });
  const packets = await Promise.all(
    caseDirectories
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const packetPath = path.join(
          packetDir,
          entry.name,
          `${entry.name}.packet.json`
        );
        return independentPolicyReviewPacketSchema.parse(
          JSON.parse(await readFile(packetPath, "utf8"))
        );
      })
  );
  return packets.sort((left, right) => left.caseId.localeCompare(right.caseId));
}

async function runWithConcurrency<T>(
  values: T[],
  concurrency: number,
  run: (value: T) => Promise<void>
) {
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        const value = values[index];
        if (value !== undefined) {
          await run(value);
        }
      }
    })
  );
}

async function main() {
  const model = getArgValue("--model");
  const lane = getArgValue("--lane");
  if (!model || !lane) {
    throw new Error("Pass --model <model-id> and --lane <output-lane>.");
  }
  const packetDir = path.resolve(
    getArgValue("--packet-dir") ?? "artifacts/policy-review-independent-v1"
  );
  const outDir = path.resolve(
    getArgValue("--out-dir") ??
      path.join("artifacts", "policy-review-model-benchmark-v1", lane)
  );
  const onlyCaseId = getArgValue("--case");
  const concurrency = positiveInteger(getArgValue("--concurrency"), 3);
  const resume = process.argv.includes("--resume");
  const allPackets = await loadPackets(packetDir);
  const packets = onlyCaseId
    ? allPackets.filter((packet) => packet.caseId === onlyCaseId)
    : allPackets;
  if (packets.length === 0) {
    throw new Error(`No packet matched ${onlyCaseId}.`);
  }
  await mkdir(outDir, { recursive: true });

  const manifestPath = path.join(outDir, "manifest.json");
  let previousManifest: Record<string, unknown> | null = null;
  try {
    previousManifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    previousManifest = null;
  }
  const startedAt =
    typeof previousManifest?.startedAt === "string"
      ? previousManifest.startedAt
      : new Date().toISOString();
  const results: Array<{
    caseId: string;
    evidenceHash: string;
    outputPath: string;
    status: string;
    summary: ReturnType<typeof summarizePolicyReviewArtifact>;
    routing?: ReturnType<typeof summarizeNanoRouting>;
  }> = [];

  await runWithConcurrency(packets, concurrency, async (packet) => {
    const outputPath = path.join(outDir, `${packet.caseId}.json`);
    let artifact = null;
    if (resume) {
      try {
        const existing = JSON.parse(await readFile(outputPath, "utf8")) as {
          evidenceHash?: unknown;
          modelArtifact?: unknown;
        };
        const parsed = policyModelReviewArtifactSchema.safeParse(existing.modelArtifact);
        if (
          existing.evidenceHash === packet.evidenceHash &&
          parsed.success &&
          parsed.data.status === "completed" &&
          parsed.data.provenance.requestedModel === model
        ) {
          artifact = parsed.data;
        }
      } catch {
        artifact = null;
      }
    }
    artifact ??= await reviewPolicyPacketWithModel({
      apiKey: process.env.OPENAI_API_KEY,
      mode: "shadow",
      model,
      packet: benchmarkPacket(packet)
    });
    const routing = /^gpt-5\.4-nano(?:-|$)/.test(model)
      ? summarizeNanoRouting({ nanoArtifact: artifact })
      : undefined;
    await writeFile(
      outputPath,
      `${JSON.stringify({
        contractVersion: "policy_review_model_benchmark_case.v1",
        caseId: packet.caseId,
        targetUrl: packet.targetUrl,
        evidenceHash: packet.evidenceHash,
        modelArtifact: artifact,
        ...(routing ? { routing } : {}),
        productionEligible: false
      }, null, 2)}\n`,
      "utf8"
    );
    const result = {
      caseId: packet.caseId,
      evidenceHash: packet.evidenceHash,
      outputPath: path.relative(outDir, outputPath),
      status: artifact.status,
      summary: summarizePolicyReviewArtifact(artifact),
      ...(routing ? { routing } : {}),
    };
    results.push(result);
    console.log(
      `[policy-review-benchmark] ${lane} ${packet.caseId}: ${artifact.status}`
    );
  });

  const completedAt = new Date().toISOString();
  const previousResults = Array.isArray(previousManifest?.results)
    ? previousManifest.results.filter(
        (entry): entry is (typeof results)[number] =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as { caseId?: unknown }).caseId === "string"
      )
    : [];
  const resultsByCaseId = new Map(
    previousResults.map((result) => [result.caseId, result])
  );
  for (const result of results) {
    resultsByCaseId.set(result.caseId, result);
  }
  const sortedResults = [...resultsByCaseId.values()].sort((left, right) =>
    left.caseId.localeCompare(right.caseId)
  );
  const manifest = {
    contractVersion: "policy_review_model_benchmark_manifest.v1",
    lane,
    requestedModel: model,
    startedAt,
    completedAt,
    packetDir,
    caseCount: sortedResults.length,
    completedCount: sortedResults.filter((result) => result.status === "completed")
      .length,
    failedCount: sortedResults.filter((result) => result.status === "failed")
      .length,
    routing: /^gpt-5\.4-nano(?:-|$)/.test(model)
      ? (() => {
          const decisions = sortedResults.flatMap((result) => result.routing?.decisions ?? []);
          const escalationTopicCount = decisions.filter(
            (decision) => decision.requiresMiniEscalation
          ).length;
          return {
            contractVersion: "nano_policy_corpus_routing.v1",
            bypassedTopicCount: decisions.length - escalationTopicCount,
            escalationTopicCount,
            estimatedMiniTopicReductionRate: decisions.length > 0
              ? (decisions.length - escalationTopicCount) / decisions.length
              : null,
            productionProjectable: false,
            topicCount: decisions.length,
          };
        })()
      : null,
    productionEligible: false,
    results: sortedResults
  };
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  console.log(JSON.stringify(manifest, null, 2));
}

void main().catch((error) => {
  console.error(
    "[policy-review-benchmark]",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
