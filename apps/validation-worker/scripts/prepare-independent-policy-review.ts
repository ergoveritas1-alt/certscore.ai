import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalEvidenceBundleSchema } from "@certscore/contracts";
import {
  buildPolicyReviewPacket,
  buildPolicyReviewPacketFromCanonicalBundle,
  type PolicyReviewPacket
} from "../src/validation/model-policy-review";
import {
  buildIndependentPolicyReviewPacket,
  buildIndependentPolicyReviewResponseTemplate,
  POLICY_REVIEW_TOPIC_GUIDANCE,
  type IndependentPolicyReviewPacket
} from "../src/validation/model-review-independent-review";
import { POLICY_REVIEW_EVALUATION_TOPICS } from "../src/validation/model-review-evaluation";
import { policyReviewGoldCorpusSchema } from "../src/validation/model-review-gold-corpus";
import { loadNanoSignalEnrichmentInputs } from "../src/validation/repository";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function scanDate(scan: Record<string, unknown> | null) {
  for (const key of ["completed_at", "started_at", "created_at"]) {
    if (typeof scan?.[key] === "string") {
      return scan[key];
    }
  }
  return null;
}

const REPO_ROOT = path.resolve(process.cwd(), "../..");

function localBundleCandidates(input: {
  scan: Record<string, unknown> | null;
  scanId: string;
}) {
  const scanConfig =
    input.scan?.scan_config_json &&
    typeof input.scan.scan_config_json === "object" &&
    !Array.isArray(input.scan.scan_config_json)
      ? input.scan.scan_config_json as Record<string, unknown>
      : null;
  const execution =
    scanConfig?.execution &&
    typeof scanConfig.execution === "object" &&
    !Array.isArray(scanConfig.execution)
      ? scanConfig.execution as Record<string, unknown>
      : null;
  const localV2Dag =
    execution?.localV2Dag &&
    typeof execution.localV2Dag === "object" &&
    !Array.isArray(execution.localV2Dag)
      ? execution.localV2Dag as Record<string, unknown>
      : null;
  const configuredOutDir =
    typeof localV2Dag?.outDir === "string" ? path.resolve(localV2Dag.outDir) : null;
  return [
    ...(configuredOutDir
      ? [path.join(configuredOutDir, "CanonicalEvidenceBundle.json")]
      : []),
    path.join(
      REPO_ROOT,
      "artifacts",
      "local-v2-dag-scans",
      input.scanId,
      "CanonicalEvidenceBundle.json"
    )
  ];
}

async function loadCanonicalPacket(input: {
  bundlePath?: string;
  scan: Record<string, unknown> | null;
  scanId: string;
}): Promise<PolicyReviewPacket | null> {
  const candidates = [
    ...(input.bundlePath ? [path.resolve(REPO_ROOT, input.bundlePath)] : []),
    ...localBundleCandidates(input)
  ];
  for (const bundlePath of [...new Set(candidates)]) {
    try {
      const bundle = canonicalEvidenceBundleSchema.parse(
        JSON.parse(await readFile(bundlePath, "utf8"))
      );
      if (input.bundlePath && bundle.scanId !== input.scanId) {
        throw new Error(
          `Configured canonical bundle scan ID ${bundle.scanId} does not match corpus scan ID ${input.scanId}.`
        );
      }
      const packet = buildPolicyReviewPacketFromCanonicalBundle(bundle, {
        scanId: input.scanId
      });
      if (packet) {
        return packet;
      }
    } catch (error) {
      const code =
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : null;
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }
  return null;
}

function renderPacketMarkdown(packet: IndependentPolicyReviewPacket) {
  const lines = [
    `# Independent policy review: ${packet.caseId}`,
    "",
    "Internal evaluation artifact only. It is not customer-facing and is never production eligible.",
    "",
    `- Scan: \`${packet.scanId}\``,
    `- Target: ${packet.targetUrl}`,
    `- Scan date: ${packet.scanDate ?? "not retained"}`,
    `- Evidence hash: \`${packet.evidenceHash}\``,
    "",
    "## Independence requirement",
    "",
    packet.instructions.independenceAttestation,
    "",
    "Do not open Mini/Nano outputs, provisional labels, existing report classifications, or another reviewer’s response while deciding the labels.",
    "",
    "## Topic decisions",
    ""
  ];
  for (const topic of POLICY_REVIEW_EVALUATION_TOPICS) {
    const guidance = POLICY_REVIEW_TOPIC_GUIDANCE[topic];
    lines.push(
      `### ${guidance.displayLabel}`,
      "",
      `Internal key: \`${topic}\``,
      "",
      guidance.question,
      "",
      `Observed standard: ${guidance.observedStandard}`,
      "",
      "- Status:",
      "- Evidence refs:",
      "- Rationale:",
      ""
    );
  }
  lines.push(
    "## Retained coverage and scan context",
    "",
    "```json",
    JSON.stringify({
      scanContext: packet.evidence.scanContext,
      evidenceCoverage: packet.evidence.evidenceCoverage
    }, null, 2),
    "```",
    ""
  );
  lines.push("## Retained runtime context", "", "```json");
  lines.push(JSON.stringify(packet.evidence.runtimeContext, null, 2), "```", "");
  for (const document of packet.evidence.documents) {
    lines.push(
      `## Retained document: ${document.documentType}`,
      "",
      `- Evidence ref: \`${document.documentId}\``,
      `- URL: ${document.canonicalUrl}`,
      `- Owner: ${document.documentOwnerEntity ?? "not attributed"}`,
      `- Target relationship: ${document.targetRelationship}`,
      `- Ownership confidence: ${document.ownershipConfidence ?? "not retained"}`,
      `- Document evaluation: ${document.documentEvaluationState}`,
      `- Content coverage: ${document.contentCoverage.status}`,
      `- Coverage limitations: ${document.contentCoverage.limitationKeys.join(", ") || "none retained"}`,
      "",
      "```text",
      document.text,
      "```",
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

async function writeResponseTemplateIfMissing(
  responsePath: string,
  packet: IndependentPolicyReviewPacket
) {
  try {
    await writeFile(
      responsePath,
      `${JSON.stringify(buildIndependentPolicyReviewResponseTemplate(packet), null, 2)}\n`,
      { encoding: "utf8", flag: "wx" }
    );
    return true;
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : null;
    if (code === "EEXIST") {
      return false;
    }
    throw error;
  }
}

async function main() {
  const corpusPath = path.resolve(
    getArgValue("--corpus") ?? "fixtures/policy-review-gold-corpus.v1.json"
  );
  const outDir = path.resolve(
    getArgValue("--out-dir") ?? "artifacts/policy-review-independent-v1"
  );
  const onlyCaseId = getArgValue("--case");
  const corpus = policyReviewGoldCorpusSchema.parse(
    JSON.parse(await readFile(corpusPath, "utf8"))
  );
  const candidates = corpus.entries.filter(
    (entry) =>
      entry.reviewStatus !== "independently_reviewed" &&
      (!onlyCaseId || entry.caseId === onlyCaseId)
  );
  if (onlyCaseId && candidates.length === 0) {
    throw new Error(`No reviewable corpus case matched ${onlyCaseId}.`);
  }

  await mkdir(outDir, { recursive: true });
  const generated: Array<{
    caseId: string;
    evidenceHash: string;
    packetPath: string;
    responseTemplateCreated: boolean;
    responsePath: string;
  }> = [];
  const unavailable: Array<{ caseId: string; reason: string }> = [];

  for (const entry of candidates) {
    try {
      let modelPacket: PolicyReviewPacket | null;
      if (entry.bundlePath) {
        modelPacket = await loadCanonicalPacket({
          bundlePath: entry.bundlePath,
          scan: null,
          scanId: entry.scanId
        });
      } else {
        const artifacts = await loadNanoSignalEnrichmentInputs(entry.scanId);
        const databasePacket = buildPolicyReviewPacket({
          documentSources: artifacts.documentSources,
          policyCandidates: artifacts.policySemanticRows,
          runtimeArtifacts: artifacts.runtimeArtifacts,
          scanDate: scanDate(artifacts.scan),
          scanId: entry.scanId
        });
        modelPacket =
          databasePacket ??
          await loadCanonicalPacket({
            scan: artifacts.scan,
            scanId: entry.scanId
          });
      }
      if (!modelPacket) {
        unavailable.push({
          caseId: entry.caseId,
          reason: "no_retained_policy_documents"
        });
        continue;
      }
      const packet = buildIndependentPolicyReviewPacket({
        caseId: entry.caseId,
        modelPacket,
        targetUrl: entry.targetUrl
      });
      const caseDir = path.join(outDir, entry.caseId);
      await mkdir(caseDir, { recursive: true });
      const packetPath = path.join(caseDir, `${entry.caseId}.packet.json`);
      const responsePath = path.join(caseDir, `${entry.caseId}.response.json`);
      await Promise.all([
        writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8"),
        writeFile(
          path.join(caseDir, `${entry.caseId}.review.md`),
          renderPacketMarkdown(packet),
          "utf8"
        )
      ]);
      const responseTemplateCreated = await writeResponseTemplateIfMissing(
        responsePath,
        packet
      );
      generated.push({
        caseId: entry.caseId,
        evidenceHash: packet.evidenceHash,
        packetPath: path.relative(outDir, packetPath),
        responseTemplateCreated,
        responsePath: path.relative(outDir, responsePath)
      });
    } catch (error) {
      unavailable.push({
        caseId: entry.caseId,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const manifest = {
    contractVersion: "policy_review_independent_bundle_manifest.v1",
    generatedAt: new Date().toISOString(),
    corpusPath,
    productionEligible: false,
    candidateCount: candidates.length,
    generatedCount: generated.length,
    unavailableCount: unavailable.length,
    generated,
    unavailable
  };
  await writeFile(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  console.log(JSON.stringify({ outDir, ...manifest }, null, 2));
  if (unavailable.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(
    "[prepare-independent-policy-review]",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
