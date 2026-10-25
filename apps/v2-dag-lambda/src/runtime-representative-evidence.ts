import { createHash } from "node:crypto";
import { getUsableRuntimeVisitSnapshot, assessRuntimeVisitSnapshot, runtimeVisitEligibilityDiagnosticSchema,
  classifyRuntimeErrorPage, type CanonicalEvidenceBundle } from "@certscore/contracts";

/** Reuses the verified runtime worker already downloaded by the coordinator.
 * Raw text, URLs and loader tokens remain in that original source only. */
export function buildRuntimeVisitEligibilityDiagnostic(bundle: CanonicalEvidenceBundle) {
  const assessment = assessRuntimeVisitSnapshot(bundle, bundle.domSnapshots);
  if (assessment.status === "usable") return undefined;
  const snapshot = [...bundle.domSnapshots].sort((a, b) => b.capturedAtMs - a.capturedAtMs)[0];
  const sha = (value: string) => createHash("sha256").update(value).digest("hex");
  return runtimeVisitEligibilityDiagnosticSchema.parse({
    policyVersion: "runtime_visit_eligibility.v1", reasonCode: assessment.reasonCode,
    snapshotCount: Math.min(10000, bundle.domSnapshots.length), snapshotCountTruncated: bundle.domSnapshots.length > 10000,
    ...(snapshot && Number.isFinite(snapshot.capturedAtMs) && snapshot.capturedAtMs >= 0 ? { selectedSnapshot: {
      capturedAtMs: snapshot.capturedAtMs, documentUrlSha256: sha(snapshot.url),
      ...(snapshot.documentIdentity?.token ? { documentTokenSha256: sha(snapshot.documentIdentity.token) } : {}),
      cdpLoaderBound: snapshot.documentIdentity?.source === "cdp_loader_id" && !!snapshot.documentIdentity.token,
      hasText: !!snapshot.textExcerpt?.trim(), hasTitle: !!snapshot.siteMetadata?.title?.trim(),
    } } : {}),
  });
}

/** A usable consent session remains retained evidence, but cannot supply the
 * original runtime visit required to publish a report with both scores. */
export function assertOriginalRuntimeVisitForReport(
  runtimeEvidence: CanonicalEvidenceBundle,
  merged: CanonicalEvidenceBundle,
): void {
  if ((merged.scanNoGoAssessment ?? merged.scan_no_go_assessment)?.decision === "no_go") return;
  if (!getUsableRuntimeVisitSnapshot(runtimeEvidence, runtimeEvidence.domSnapshots)) {
    throw new Error("original_runtime_visit_unavailable");
  }
}

/** A successful transport is not a representative page. Read only the original
 * runtime worker's retained main-document evidence, never another lane's DOM.
 * Missing proof is unknown; this predicate does not manufacture a no-go. */
export function hasRepresentativeRuntimeEvidence(bundle: CanonicalEvidenceBundle): boolean {
  const duration = Date.parse(bundle.completedAt) - Date.parse(bundle.startedAt);
  const snapshot = [...bundle.domSnapshots].sort((a, b) => b.capturedAtMs - a.capturedAtMs)[0];
  if (!snapshot || !Number.isFinite(duration) || duration < 0 || !Number.isFinite(snapshot.capturedAtMs) ||
      snapshot.capturedAtMs < 0 || snapshot.capturedAtMs > duration ||
      snapshot.documentIdentity?.source !== "cdp_loader_id" || !snapshot.documentIdentity.token ||
      !snapshot.artifactId || !snapshot.path) return false;
  if (bundle.domSnapshots.some(other => other.capturedAtMs === snapshot.capturedAtMs &&
      (other.url !== snapshot.url || other.documentIdentity?.token !== snapshot.documentIdentity?.token))) return false;
  let url: URL;
  try { url = new URL(snapshot.url); } catch { return false; }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
  // A later document-bound observation must not contradict the snapshot being
  // used. In particular, an old page's text cannot rescue a new empty document.
  const audit = bundle.accessibilityAudit;
  if (audit && Date.parse(audit.completedAt) >= Date.parse(bundle.startedAt) + snapshot.capturedAtMs &&
      (audit.documentUrl !== snapshot.url || audit.documentToken !== snapshot.documentIdentity.token)) return false;
  const inventory = bundle.collectionSurfaceInventory;
  if (inventory && inventory.observedAtMs >= snapshot.capturedAtMs && inventory.pageUrl !== snapshot.url) return false;
  const text = snapshot.textExcerpt?.replace(/\s+/g, " ").trim() ?? "";
  if (classifyRuntimeErrorPage(snapshot.textExcerpt)) return false;
  const title = snapshot.siteMetadata?.title?.trim();
  // A short or non-whitespace-delimited page need not meet an English word
  // count. Retained title AND body content are positive page evidence; title
  // alone and a bare loading message are not. Existing no-go decisions still win.
  if (title && /[\p{L}\p{N}]/u.test(text) &&
      !/^(?:loading|please wait|initializing|establishing connection)[\s.!…]*$/i.test(text)) return true;
  // Reuse the existing canonical no-go assessment's substantive-text bounds.
  if (text.length >= 180 && text.split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length >= 24) return true;
  // Non-text pages can qualify through an already-retained positive visual
  // assessment from this exact runtime document. A screenshot pointer alone,
  // canvas element, title, script, cookie or request is not positive proof.
  const assessment = bundle.scanNoGoAssessment ?? bundle.scan_no_go_assessment;
  return assessment?.decision === "continue_with_diagnostics" &&
    assessment.supportingSignals.visuallySubstantiveScreenshotObserved === true &&
    assessment.supportingSignals.visualNoGo === false &&
    assessment.supportingSignals.visualHardNoGoPageState === false &&
    bundle.screenshots.some(shot => shot.retentionStatus === "available" &&
      shot.url === snapshot.url && shot.documentIdentity?.source === "cdp_loader_id" &&
      shot.documentIdentity.token === snapshot.documentIdentity!.token &&
      shot.capturedAtMs >= snapshot.capturedAtMs && shot.capturedAtMs <= duration &&
      shot.captureMethod !== "primary_placeholder" && shot.captureMethod !== "fresh_context_placeholder");
}
