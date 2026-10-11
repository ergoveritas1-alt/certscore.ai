import { z } from "zod";
import { crawlDisplayUrl, type CrawlObservation } from "@website-signal-risk-scanner/shared";
import { createHash } from "node:crypto";
import { siteIntegrityObservationSchema, siteIntegrityProjectionSchema, domSnapshotArtifactSchema, scanModuleRunSchema, type CanonicalEvidenceBundle, type DomSnapshotArtifact } from "@certscore/contracts";

function latestRuntimeDocumentMatches(snapshots: readonly DomSnapshotArtifact[], documentUrl: string, documentToken: string, durationMs: number) {
  let latest: DomSnapshotArtifact | undefined;
  let conflictingLatest = false;
  for (const snapshot of snapshots) {
    if (snapshot.consentStateAtTime !== "pre_consent") continue;
    if (!Number.isFinite(snapshot.capturedAtMs) || snapshot.capturedAtMs < 0 || snapshot.capturedAtMs > durationMs) return false;
    if (!latest || snapshot.capturedAtMs > latest.capturedAtMs) {
      latest = snapshot;
      conflictingLatest = false;
    } else if (snapshot.capturedAtMs === latest.capturedAtMs &&
        (snapshot.url !== latest.url || snapshot.documentIdentity?.token !== latest.documentIdentity?.token)) {
      conflictingLatest = true;
    }
  }
  return !conflictingLatest && latest?.url === documentUrl && latest.documentIdentity?.token === documentToken;
}

/** Called only after the retained canonical bundle's original bytes have been verified. */
export function projectSiteIntegrity(bundle: CanonicalEvidenceBundle, source: { sha256?: string; verificationStatus?: string } | undefined, documentUrl: string | null) {
  const observation = bundle.siteIntegrityObservation;
  if (!observation || !documentUrl || source?.verificationStatus !== "verified" || !source.sha256) return null;
  let document: URL;
  try { document = new URL(documentUrl); } catch { return null; }
  document.search = ""; document.hash = ""; document.username = ""; document.password = "";
  if (![observation.capturedAt, bundle.startedAt, bundle.completedAt].every(value => Number.isFinite(Date.parse(value)))) return null;
  if (observation.documentUrl !== document.href ||
      Date.parse(observation.capturedAt) < Date.parse(bundle.startedAt) ||
      Date.parse(observation.capturedAt) > Date.parse(bundle.completedAt)) return null;
  // Earlier matching proof must not survive a later reload or navigation.
  // Runtime evidence remains independent of the consent lane.
  const matchingDocument = latestRuntimeDocumentMatches(bundle.runtimeMetadataSnapshots ?? bundle.domSnapshots,
    documentUrl, observation.documentToken, Date.parse(bundle.completedAt) - Date.parse(bundle.startedAt));
  if (!matchingDocument) return null;
  const projection = siteIntegrityProjectionSchema.safeParse({
    contractVersion: "certscore.site-integrity-projection.v1", scanId: bundle.scanId,
    verificationStatus: "verified", sourceHash: source.sha256,
    observationHash: createHash("sha256").update(JSON.stringify(observation)).digest("hex"),
    evidenceRef: "CanonicalEvidenceBundle.json#siteIntegrityObservation", observation,
  });
  return projection.success ? projection.data : null;
}

const pageCaptureSchema = z.object({
  parentScanId: z.string(), pageId: z.string().uuid(), attemptId: z.string().uuid(),
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/), startedAt: z.string().datetime(), completedAt: z.string().datetime(), finalUrl: z.string().url(),
}).strict();

/** Called only after original evidence bytes, completed attempt and inventory packet have been verified. */
export function projectAdditionalPageSiteIntegrity(evidence: Record<string, unknown>, packet: CrawlObservation, parentScanId: string) {
  const capture = pageCaptureSchema.safeParse(evidence.siteIntegrityPageCapture);
  const parsed = siteIntegrityObservationSchema.safeParse(evidence.siteIntegrityObservation);
  const moduleRun = scanModuleRunSchema.safeParse(evidence.moduleRun);
  const snapshots = domSnapshotArtifactSchema.array().safeParse(evidence.domSnapshots);
  if (createHash("sha256").update(JSON.stringify(evidence)).digest("hex") !== packet.sourceHash) return null;
  if (!capture.success || !parsed.success || !moduleRun.success || !snapshots.success || moduleRun.data.status !== "completed" ||
      packet.status !== "completed" || packet.failureKind || (packet.httpStatus !== null && packet.httpStatus >= 400) ||
      packet.executionProfile !== "inventory_only" || !packet.finalUrl || packet.parentScanId !== parentScanId ||
      capture.data.parentScanId !== parentScanId || capture.data.pageId !== packet.pageJobId || capture.data.attemptId !== packet.attemptId ||
      capture.data.configurationHash !== packet.configurationHash || capture.data.startedAt !== packet.startedAt || capture.data.completedAt !== packet.completedAt) return null;
  const observation = parsed.data;
  const document = new URL(capture.data.finalUrl);
  document.search = ""; document.hash = ""; document.username = ""; document.password = "";
  if (observation.scope !== "additional_page_main_document" || observation.documentUrl !== document.href || crawlDisplayUrl(capture.data.finalUrl) !== packet.finalUrl ||
      Date.parse(observation.capturedAt) < Date.parse(packet.startedAt) || Date.parse(observation.capturedAt) > Date.parse(packet.completedAt) ||
      !latestRuntimeDocumentMatches(snapshots.data, capture.data.finalUrl, observation.documentToken,
        Date.parse(packet.completedAt) - Date.parse(packet.startedAt))) return null;
  const projection = siteIntegrityProjectionSchema.safeParse({
    contractVersion: "certscore.site-integrity-projection.v2", scanId: parentScanId,
    pageId: packet.pageJobId, attemptId: packet.attemptId, configurationHash: packet.configurationHash,
    sourceHash: packet.sourceHash, verificationStatus: "verified",
    observationHash: createHash("sha256").update(JSON.stringify(observation)).digest("hex"),
    evidenceRef: `full-site:${packet.pageJobId}:${packet.attemptId}:evidence.json#siteIntegrityObservation`, observation,
  });
  return projection.success ? projection.data : null;
}
