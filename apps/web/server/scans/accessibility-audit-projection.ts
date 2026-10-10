import {
  accessibilityAuditObservationSchema, accessibilityAuditProjectionSchema,
  type AccessibilityAuditObservation, type CanonicalEvidenceBundle,
} from "@certscore/contracts";
import { createHash } from "node:crypto";
import { domSnapshotArtifactSchema, scanModuleRunSchema } from "@certscore/contracts";
import type { CrawlObservation } from "@website-signal-risk-scanner/shared";
import { z } from "zod";

/** Materialization consumes the original checksum-verified canonical bundle only. */
export function projectAccessibilityAudit(bundle: CanonicalEvidenceBundle, source: {
  verificationStatus?: string; sha256?: string;
} | undefined, documentUrl: string | null) {
  if (!bundle.accessibilityAudit) return null; // Preserve historical results.
  if (source?.verificationStatus !== "verified" || !/^[a-f0-9]{64}$/.test(source.sha256 ?? "")) {
    throw new Error("Required accessibility evidence must be checksum-verified before publication.");
  }
  const result = accessibilityAuditObservationSchema.safeParse(bundle.accessibilityAudit);
  if (!result.success || result.data.scanId !== bundle.scanId) {
    throw new Error("Required accessibility evidence is malformed or belongs to another scan.");
  }
  let observation = result.data;
  const start = Date.parse(bundle.startedAt), end = Date.parse(bundle.completedAt);
  const snapshot = [...(bundle.runtimeMetadataSnapshots ?? bundle.domSnapshots ?? [])]
    .filter(row => row.consentStateAtTime === "pre_consent")
    .sort((left, right) => right.capturedAtMs - left.capturedAtMs)[0];
  const bound = observation.documentUrl === documentUrl && snapshot?.url === observation.documentUrl &&
    snapshot.documentIdentity?.token === observation.documentToken && Boolean(observation.documentToken) &&
    Number.isFinite(start) && Number.isFinite(end) &&
    Date.parse(observation.startedAt) >= start && Date.parse(observation.completedAt) <= end;
  // Failed/not-testable observations contain no evaluable results. Preserve
  // their actual coverage reason rather than inventing a binding failure.
  if (!bound && observation.status !== "failed" && observation.status !== "not_testable") {
    observation = { ...observation, status: "limited", rulesEvaluated: [], violations: [], reviewItems: [], limitations: ["evidence_binding_invalid"] };
  }
  return accessibilityAuditProjectionSchema.parse({
    contractVersion: "certscore.accessibility-audit-projection.v1", verificationStatus: "verified",
    sourceHash: source.sha256, evidenceRef: "CanonicalEvidenceBundle.json#accessibilityAudit", observation,
  });
}

export { accessibilityExamples } from "../../lib/scans/accessibility-audit-evidence";

/** Optional existing page audit only; this never requests additional capture. */
export function projectAdditionalPageAccessibilityAudit(evidence: Record<string, unknown>, packet: CrawlObservation, parentScanId: string) {
  // Existing inventory capture envelope binds the original bytes to page/attempt/configuration.
  const capture = z.object({ parentScanId: z.string(), pageId: z.string().uuid(), attemptId: z.string().uuid(),
    configurationHash: z.string(), startedAt: z.string().datetime(), completedAt: z.string().datetime(), finalUrl: z.string().url(),
  }).safeParse(evidence.siteIntegrityPageCapture);
  const audit = accessibilityAuditObservationSchema.safeParse(evidence.accessibilityAudit);
  const moduleRun = scanModuleRunSchema.safeParse(evidence.moduleRun);
  const snapshots = domSnapshotArtifactSchema.array().safeParse(evidence.domSnapshots);
  if (!capture.success || !audit.success || !moduleRun.success || !snapshots.success || moduleRun.data.status !== "completed" ||
    packet.status !== "completed" || packet.failureKind || (packet.httpStatus !== null && packet.httpStatus >= 400) ||
    packet.executionProfile !== "inventory_only" || packet.parentScanId !== parentScanId ||
    capture.data.parentScanId !== parentScanId || capture.data.pageId !== packet.pageJobId || capture.data.attemptId !== packet.attemptId ||
    capture.data.configurationHash !== packet.configurationHash || capture.data.startedAt !== packet.startedAt || capture.data.completedAt !== packet.completedAt ||
    capture.data.finalUrl !== packet.finalUrl || createHash("sha256").update(JSON.stringify(evidence)).digest("hex") !== packet.sourceHash) return null;
  const a = audit.data;
  const latest = snapshots.data.filter(snapshot => snapshot.consentStateAtTime === "pre_consent")
    .sort((left, right) => right.capturedAtMs - left.capturedAtMs)[0];
  if (a.scanId !== packet.pageJobId || a.documentUrl !== packet.finalUrl ||
    Date.parse(a.startedAt) < Date.parse(packet.startedAt) || Date.parse(a.completedAt) > Date.parse(packet.completedAt) ||
    !a.documentToken || latest?.url !== a.documentUrl || latest.documentIdentity?.token !== a.documentToken) return null;
  const projection = accessibilityAuditProjectionSchema.safeParse({
    contractVersion: "certscore.accessibility-audit-projection.v2", verificationStatus: "verified", sourceHash: packet.sourceHash,
    parentScanId, pageId: packet.pageJobId, attemptId: packet.attemptId, configurationHash: packet.configurationHash,
    evidenceRef: `full-site:${packet.pageJobId}:${packet.attemptId}:evidence.json#accessibilityAudit`, observation: a,
  });
  return projection.success ? projection.data : null;
}
