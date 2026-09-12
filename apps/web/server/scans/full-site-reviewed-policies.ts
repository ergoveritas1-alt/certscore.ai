import "server-only";
import { createHash } from "node:crypto";
import { policyTextEvidenceProjectionSchema } from "@certscore/contracts";
import { query } from "@website-signal-risk-scanner/db";
import { readPersistedScanReportProjection } from "./scan-report-projection-contract";
import type { ScanDetailResponse } from "./get-scan-by-id";
import { readProjectedPolicyTextArtifact } from "./local-v2-dag-report";
import type { ReviewedPolicy } from "../../lib/scans/full-site-resource-context";
const cache = new Map<string, Promise<ReviewedPolicy[]>>();
export async function loadScanReviewedPolicies(scanId: string) {
  const { rows: [snapshot] } = await query<Record<string, unknown>>("select report_projection_payload,report_projection_payload_sha256,report_projection_payload_size_bytes,report_projection_status,report_projection_version,report_projection_computed_at from scan_snapshots where scan_id=$1", [scanId]);
  if (!snapshot) return [];
  const home = readPersistedScanReportProjection({ scan: { id: scanId, status: "completed" } as ScanDetailResponse["scan"], snapshot });
  const summary = (home?.runtimeArtifacts?.policy_disclosure_summary ?? home?.runtimeArtifacts?.policyDisclosureSummary) as Record<string, unknown> | undefined;
  const parsed = policyTextEvidenceProjectionSchema.safeParse(summary?.policyTextEvidenceProjection ?? summary?.policy_text_evidence_projection);
  if (!parsed.success || parsed.data.scanId !== scanId || parsed.data.sourceBundle.verificationStatus !== "verified") return [];
  const key = `${scanId}:${snapshot.report_projection_payload_sha256}`;
  const existing = cache.get(key); if (existing) return existing;
  const task = (async () => {
    const documents: ReviewedPolicy[] = [];
    const candidates = parsed.data.documents.filter(doc => doc.documentRole === "policy_document" && ["target_controller", "first_party_brand"].includes(doc.targetRelationship));
    for (const doc of candidates) {
      try {
        if (doc.artifactVerificationStatus !== "verified" || !doc.artifactUri?.startsWith("s3://") || !doc.artifactSha256 || !doc.retainedTextSha256 || doc.documentEvaluationState !== "usable") continue;
        const bundleUri = parsed.data.sourceBundle.uri;
        if (!bundleUri?.startsWith("s3://") || !doc.artifactUri.startsWith(bundleUri.slice(0, bundleUri.lastIndexOf("/") + 1))) continue;
        const retained = await readProjectedPolicyTextArtifact({ uri: doc.artifactUri, sha256: doc.artifactSha256, sizeBytes: doc.artifactSizeBytes ?? null, verificationRequired: true }, scanId);
        if (createHash("sha256").update(retained.text).digest("hex") !== doc.retainedTextSha256) continue;
        documents.push({ url: doc.finalUrl ?? doc.requestedUrl, text: retained.text, sha256: doc.retainedTextSha256, complete: doc.extractionStatus === "complete" && doc.documentTextCoverage.status === "complete", capturedAt: parsed.data.generatedAt });
      } catch { /* Missing/unverifiable retained text stays unknown. */ }
    }
    if (documents.length !== candidates.length) documents.forEach(document => { document.complete = false; });
    return documents;
  })();
  cache.set(key, task); if (cache.size > 16) cache.delete(cache.keys().next().value!);
  return task;
}

// Compatibility alias: both report scopes use the same verified artifact loader.
export const loadFullSiteReviewedPolicies = loadScanReviewedPolicies;
