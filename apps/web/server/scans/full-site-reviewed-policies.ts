import "server-only";
import { createHash } from "node:crypto";
import { policyTextEvidenceProjectionSchema } from "@certscore/contracts";
import { query } from "@website-signal-risk-scanner/db";
import { readPersistedScanReportProjection } from "./scan-report-projection-contract";
import type { ScanDetailResponse } from "./get-scan-by-id";
import { readProjectedPolicyTextArtifact } from "./local-v2-dag-report";
import type { ReviewedPolicy } from "../../lib/scans/full-site-resource-context";
const cache = new Map<string, Promise<{ documents: ReviewedPolicy[]; incomplete: boolean }>>();
export async function loadScanReviewedPolicies(scanId: string, onIncomplete?: () => void) {
  const { rows: [snapshot] } = await query<Record<string, unknown>>("select report_projection_payload,report_projection_payload_sha256,report_projection_payload_size_bytes,report_projection_status,report_projection_version,report_projection_computed_at from scan_snapshots where scan_id=$1", [scanId]);
  if (!snapshot) return [];
  const home = readPersistedScanReportProjection({ scan: { id: scanId, status: "completed" } as ScanDetailResponse["scan"], snapshot });
  return home ? loadReviewedPoliciesFromProjection(home, onIncomplete) : [];
}

/** The caller supplies the checksum-verified persisted report it already loaded. */
export async function loadReviewedPoliciesFromProjection(home: ScanDetailResponse, onIncomplete?: () => void) {
  const scanId = home.scan.id;
  const summary = (home.runtimeArtifacts?.policy_disclosure_summary ?? home.runtimeArtifacts?.policyDisclosureSummary) as Record<string, unknown> | undefined;
  const parsed = policyTextEvidenceProjectionSchema.safeParse(summary?.policyTextEvidenceProjection ?? summary?.policy_text_evidence_projection);
  if (!parsed.success || parsed.data.scanId !== scanId || parsed.data.sourceBundle.verificationStatus !== "verified") return [];
  const key = `${scanId}:${createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex")}`;
  const existing = cache.get(key); if (existing) {
    const retained = await existing;
    if (retained.incomplete) onIncomplete?.();
    return retained.documents;
  }
  const task = (async () => {
    const documents: ReviewedPolicy[] = [];
    const candidates = parsed.data.documents.filter(doc => doc.documentRole === "policy_document" && ["target_controller", "first_party_brand"].includes(doc.targetRelationship));
    const outcomes = await mapWithConcurrency(candidates, 4, async doc => {
      try {
        if (doc.artifactVerificationStatus !== "verified" || !doc.artifactUri?.startsWith("s3://") || !doc.artifactSha256 || !doc.retainedTextSha256 || doc.documentEvaluationState !== "usable") return null;
        const bundleUri = parsed.data.sourceBundle.uri;
        if (!bundleUri?.startsWith("s3://") || !doc.artifactUri.startsWith(bundleUri.slice(0, bundleUri.lastIndexOf("/") + 1))) return null;
        const retained = await readProjectedPolicyTextArtifact({ uri: doc.artifactUri, sha256: doc.artifactSha256, sizeBytes: doc.artifactSizeBytes ?? null, verificationRequired: true }, scanId);
        if (createHash("sha256").update(retained.text).digest("hex") !== doc.retainedTextSha256) return null;
        return { url: doc.finalUrl ?? doc.requestedUrl, text: retained.text, sha256: doc.retainedTextSha256, complete: doc.extractionStatus === "complete" && doc.documentTextCoverage.status === "complete", capturedAt: parsed.data.generatedAt };
      } catch { /* Missing/unverifiable retained text stays unknown. */ }
      return null;
    });
    for (const document of outcomes) if (document) documents.push(document);
    if (documents.length !== candidates.length) documents.forEach(document => { document.complete = false; });
    return { documents, incomplete: documents.length !== candidates.length };
  })();
  cache.set(key, task); if (cache.size > 16) cache.delete(cache.keys().next().value!);
  const retained = await task;
  if (retained.incomplete) {
    if (cache.get(key) === task) cache.delete(key);
    onIncomplete?.();
  }
  return retained.documents;
}

// Compatibility alias: both report scopes use the same verified artifact loader.
export const loadFullSiteReviewedPolicies = loadScanReviewedPolicies;

async function mapWithConcurrency<T, U>(items: T[], limit: number, run: (item: T) => Promise<U>): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]!);
    }
  }));
  return results;
}
