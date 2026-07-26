import { readFile } from "node:fs/promises";
import path from "node:path";
import { canonicalEvidenceBundleSchema } from "@certscore/contracts";
import { queryOne } from "@website-signal-risk-scanner/db";
import { getWorkerEnv } from "../src/env";
import { buildPolicyReviewPacketFromCanonicalBundle } from "../src/validation/model-policy-review";
import { runPolicyReviewPacket } from "../src/validation/model-policy-review-runner";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function localBundlePath(scanConfig: Record<string, unknown> | null) {
  const execution =
    scanConfig?.execution && typeof scanConfig.execution === "object" && !Array.isArray(scanConfig.execution)
      ? scanConfig.execution as Record<string, unknown>
      : null;
  const localV2Dag =
    execution?.localV2Dag && typeof execution.localV2Dag === "object" && !Array.isArray(execution.localV2Dag)
      ? execution.localV2Dag as Record<string, unknown>
      : null;
  const outDir = typeof localV2Dag?.outDir === "string" ? localV2Dag.outDir : null;
  return outDir ? path.join(path.resolve(outDir), "CanonicalEvidenceBundle.json") : null;
}

async function main() {
  const scanId = getArgValue("--scan-id");
  if (!scanId) {
    throw new Error("Pass --scan-id <uuid>.");
  }
  const scan = await queryOne<{
    completed_at: string | null;
    scan_config_json: Record<string, unknown> | null;
    status: string;
  }>(
    `select completed_at, scan_config_json, status from scans where id = $1`,
    [scanId],
    { readOnly: true }
  );
  if (!scan) {
    throw new Error(`Unknown scan ${scanId}.`);
  }
  if (scan.status !== "completed") {
    throw new Error(`Scan ${scanId} is ${scan.status}; a completed retained bundle is required.`);
  }

  const bundlePath = getArgValue("--bundle") ?? localBundlePath(scan.scan_config_json);
  if (!bundlePath) {
    throw new Error(`Scan ${scanId} does not expose a local canonical v2 bundle path.`);
  }
  const bundle = canonicalEvidenceBundleSchema.parse(JSON.parse(await readFile(bundlePath, "utf8")));
  const packet = buildPolicyReviewPacketFromCanonicalBundle(bundle, { scanId });
  if (!packet) {
    throw new Error(`Bundle ${bundlePath} contains no usable retained policy documents.`);
  }

  const env = getWorkerEnv();
  const repeat = positiveInteger(getArgValue("--repeat"), 1);
  for (let iteration = 1; iteration <= repeat; iteration += 1) {
    const result = await runPolicyReviewPacket({
      apiKey: env.OPENAI_API_KEY,
      mode: "shadow",
      model: env.CERTSCORE_REVIEW_MODEL,
      packet
    });
    console.log(JSON.stringify({
      cacheHit: result.cacheHit,
      deterministicLegalFrameworkSignals: result.artifact.deterministicLegalFrameworkSignals,
      documents: packet.documents.map((document) => ({
        canonicalUrl: document.canonicalUrl,
        documentId: document.documentId,
        documentType: document.documentType,
        retainedCharacters: document.text.length
      })),
      iteration,
      model: result.artifact.provenance.resolvedModel,
      productionEligible: result.artifact.productionEligible,
      rows: result.artifact.rows.map((row) => ({
        confidence: row.confidence,
        reasonCodes: row.reasonCodes,
        status: row.status,
        topic: row.topic
      })),
      scannerCorrelationId: bundle.scanId,
      scanId,
      summary: result.summary
    }, null, 2));
  }
}

void main().catch((error) => {
  console.error("[model-policy-shadow]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
